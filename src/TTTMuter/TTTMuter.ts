import { Server } from "http";
import { API_KEY, GUILD_ID, PORT, CHANNEL_ID } from "./config.json";
import DiscordAddon from "../DiscordAddon";
import { Client, Guild } from "discord.js";
import express, { Express } from "express";

export default class TTTMuter extends DiscordAddon {
  name = "TTT Muter";
  description = "Mutes People.";
  emoji = "🎮🔪";
  legacyEnabled = true; // TODO: add manual override

  client?: Client;
  guild?: Guild;
  app?: Express;
  server?: Server;

  async execute(client: Client): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.debug("TTT addon loading");
      this.client = client;
      if (!client) {
        this.error("No client received!");
        return reject();
      }

      this.guild = this.client.guilds.cache.get(GUILD_ID);
      if (!this.guild) {
        this.error("Guild not found!");
        return reject();
      }

      this.app = express();

      this.routes();

      this.server = this.app.listen(PORT, () => {
        this.log(`Bot endpoint is running on port ${PORT}`);
      });

      resolve(true);
    });
  }

  routes() {
    if (!this.app) return;
    this.debug("Initializing routes");

    this.app.use(express.json({ limit: "10kb" }));
    this.app.use(express.urlencoded({ extended: true })); // support encoded bodies (required)

    this.app.use("/", (req, res, next) => {
      this.debug(`[${req.method}] ${req.path}`);
      this.debug("[HEADERS]", req.headers);
      this.debug("[BODY]", req.body);

      if (!this.guild) {
        res.status(500).end();
        this.error("Guild is not set!");
        return;
      }

      if (req.headers.authorization === `Basic ${API_KEY}`) {
        next();
        return;
      }

      this.log(
        `${req.ip} tried to request but was not authorized! (${req.headers.authorization})`
      );

      res
        .status(401)
        .json({
          errorId: "AUTHORIZATION_MISMATCH",
          errorMsg: "Authorization mismatch",
        })
        .end();
    });

    this.app.get("/id", (req, res, next) => {
      const { name, nick } = req.query;

      if (typeof name !== "string" || typeof nick !== "string") {
        res.status(400).end();
        this.error("Invalid request, parameters missing.");
        return;
      }

      const found = this.guild!.members.cache.find(
        (member) =>
          member.displayName === name ||
          member.displayName === nick ||
          member.displayName
            .toLowerCase()
            .match(new RegExp(`.*${name.toLowerCase()}.*`)) ||
          member.displayName
            .toLowerCase()
            .match(new RegExp(`.*${nick.toLowerCase()}.*`))
      );

      if (!found) {
        res.status(404).json({ answer: 0 }).end();
        this.error(`0 users found with name "${name}" or nick ${nick}.`);
      } else {
        res
          .status(200)
          .json({ name: found.displayName, nick: found.nickname, id: found.id })
          .end();
        this.log(
          `Success matched ${found.displayName} (${found.id}) to ${nick} (${name})`
        );
      }
    });

    interface MuteRequest {
      id: string;
      status: boolean;
    }

    this.app.post("/mute", async (req, res, next) => {
      let body: MuteRequest | MuteRequest[];
      try {
        body = req.body;
      } catch (err) {
        this.error("Couldn't parse request!", err);
        res.status(500).end();
        return;
      }

      if (!Array.isArray(body)) {
        body = [body];
      }

      for (const { id, status } of body) {
        if (id && typeof status === "boolean") {
          for (let i = 0; i < id.length; i++) {
            if (isNaN(Number(id[i]))) {
              res.status(400).end();
              this.debug("id:", id, "status", status);
              this.warn("Invalid request received");
              return;
            }
          }
          try {
            const member = await this.guild!.members.fetch(id);
            await member.voice.setMute(
              status,
              status ? "dead players can't talk!" : undefined
            );
          } catch (err) {
            res.status(500).end();
            this.error("Couldn't resolve id", id);
            return;
          }
        } else {
          this.error("Invalid request");
          res.status(400).end();
          return;
        }
      }
      res.status(200).json({ success: true }).end();
      this.log(`[Success]`);
      return;
    });

    if (this.legacyEnabled) {
      this.log("Loading legacy routes");
      this.app.get("/", async (req, res, next) => {
        this.warn("Hitting legacy backend");
        let params: any | undefined;
        try {
          if (typeof req.headers.req !== "string") {
            res.status(400).end();
            this.debug("Received invalid request");
            return;
          }
          if (typeof req.headers.params === "string") {
            params = JSON.parse(req.headers.params);
          }
        } catch (err) {
          res.status(500).end();
          this.debug("Received invalid request", err);
          return;
        }

        this.debug("REQUEST", req.headers.req);

        switch (req.headers.req) {
          case "connect": {
            if (!params.tag || typeof params.tag !== "string") {
              res.status(400).end();
              this.error("no tag!");
              return;
            }

            const tag = (params.tag as String).toLowerCase();
            // TODO: check if handling correct
            this.warn("Is this tag correct?", tag);
            this.log("[LegacyConnect][Requesting]", `Searching for "${tag}"`);

            const found = this.guild!.members.cache.find(
              (member) =>
                member.displayName === tag ||
                member.displayName
                  .toLowerCase()
                  .match(new RegExp(`.*${tag.toLowerCase()}.*`))
            );

            if (!found) {
              res.status(404).json({ answer: 0 });
              this.error(
                "[LegacyConnect][Error]",
                `0 users found with tag "${tag}".`
              );
              return;
            } else {
              res.status(200).json({ tag: found.displayName, id: found.id });
              this.log(
                "[LegacyConnect][Success]",
                `Connecting ${found.displayName} (${found.id})`
              );
              return;
            }
          }
          case "sync": {
            res.json({
              success: true,
              version: "1.0.0", // TODO: Update Version to Addon version
              debugMode: this.debug,
              discordGuild: this.guild?.id,
              discordChannel: CHANNEL_ID,
            });
            this.log("[LegacySync][Request]", params);
            return;
          }
          case "keep_alive": {
            res.json({ success: true });
            this.log("[LegacyKeepAlive][Request]", params);
            break;
          }
          case "mute": {
            const { id, mute } = params;

            if (typeof id !== "string" || typeof mute !== "boolean") {
              res
                .status(400)
                .json({
                  success: false,
                  errorId: "INVALID_PARAMS",
                  errorMsg: "ID or Mute value missing",
                })
                .end();
              this.error(
                "[LegacyMute][Missing Params]",
                `id: "${id}" (${typeof id}), mute: "${mute}" (${typeof mute})`
              );
              return;
            }

            try {
              const member = await this.guild!.members.fetch(id);
              await member.voice.setMute(
                mute,
                mute ? "dead players can't talk!" : undefined
              );
              res.status(200).json({ success: true });
              this.log(
                `[LegacyMute][Discord:SetMute][Success]`,
                `${mute ? "Muted" : "Unmuted"} ${id}`
              );
            } catch (err) {
              res
                .status(500)
                .json({
                  success: false,
                  errorId: "DISCORD_ERROR",
                  errorMsg: err,
                })
                .end();
              this.error(
                `[LegacyMute][Discord:SetMute][Error]`,
                `${mute ? "Mute" : "Unmute"}: ${id} - ${err}`
              );
            }
            break;
          }
        }
      });
    }
  }

  stop(): void {
    this.server?.close();
  }
}
