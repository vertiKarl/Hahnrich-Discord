import http, { Server } from 'http';
import { API_KEY, GUILD_ID, PORT, CHANNEL_ID } from "./config.json";
import Logger from 'hahnrich';
import DiscordAddon from '../DiscordAddon';
import { Client, Guild } from 'discord.js';
import chalk from 'chalk';

function respondJson(res: http.ServerResponse, content: Object) {
    res.end(JSON.stringify(content));
}

export default class TTTMuter extends DiscordAddon {
    name = "TTT Muter";
    description = "Mutes People.";
    httpServer: Server | undefined;
    emoji = '🎮🔪';

    client: Client | undefined;
    guild: Guild | undefined;


    async execute(client: Client): Promise<boolean> {
        return new Promise((resolve, reject) => {
            this.debug("TTT addon loading");
            this.client = client;
            if(!client) {
                this.error("No client received!")
                return reject();
            }

            this.httpServer = http.createServer((req, res) => {
                this.handleRequest(req, res);
            }).listen(PORT, () => {
                this.log(chalk.green(`Bot endpoint is running on port ${PORT}`));
              });

            this.guild = this.client.guilds.cache.get(GUILD_ID);
            if(!this.guild) {
                this.error("Guild not found!")
                return reject();
            }


            resolve(true);
        });
    }

    stop(): void {
        this.httpServer?.close();
    }


    async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        const { req: reqType, params: paramsJson, authorization } = req.headers;
        this.debug(authorization);
        if (!authorization || (authorization && authorization !== `Basic ${API_KEY}`)) {
            res.writeHead(401);
            respondJson(res, { errorId: 'AUTHORIZATION_MISMATCH', errorMsg: 'Authorization mismatch' });
            this.error('[Authorization Error]', `"${authorization}" !== "Basic ${API_KEY}"`);
            return;
        }

        this.debug("HEADERS", req.headers);
        this.debug("RAW PARAMS", paramsJson);

        if(!paramsJson || typeof paramsJson === "object") {
            res.writeHead(404);
            respondJson(res, { errorId: 'UNKNOWN_REQUEST', errorMsg: `Unknown request "${reqType}"` });
            this.error('[Unknown Request]', `Unknown request "${reqType}"`);
            return;
        }

        interface paramsInterface {
            tag?: string,
            id?: string,
            mute?: boolean
        }

        const params: paramsInterface = JSON.parse(paramsJson || '{}');
        this.debug("JSON PARAMS", paramsJson);

        switch(reqType) {
            case "connect":
                if(!this.guild) {
                    this.error("Incoming connect request but no guild is set!");
                    return;
                }
                if(!params.tag) {
                    this.error("no tag!");
                    return;
                }
                const tag = params.tag.toLowerCase();
                // TODO: check if handling correct
                this.warn("Is this tag correct?", tag);
                this.log('[Connect][Requesting]', `Searching for "${tag}"`);


                const found = this.guild.members.cache.find(
                    member => member.displayName === tag || member.displayName.toLowerCase().match(new RegExp(`.*${tag}.*`))
                );

                if (!found) {
                    respondJson(res, { answer: 0 });
                    this.error('[Connect][Error]', `0 users found with tag "${tag}".`);
                } else {
                    respondJson(res, { tag: found.displayName, id: found.id });
                    this.log(chalk.green('[Connect][Success]', `Connecting ${found.displayName} (${found.id})`));
                }
                break;
            case "mute":
                const { id, mute } = params;

                if(!this.guild) {
                    this.error("Mute request but not in guild!");
                    return;
                }

                if (typeof id !== 'string' || typeof mute !== 'boolean') {
                    respondJson(res, { success: false, errorId: 'INVALID_PARAMS', errorMsg: 'ID or Mute value missing' });
                    this.error('[Mute][Missing Params]', `id: "${id}" (${typeof id}), mute: "${mute}" (${typeof mute})`);
                    return;
                }

                try {
                    const member = await this.guild.members.fetch(id);
                    await member.voice.setMute(mute, mute ? "dead players can't talk!" : undefined);
                    respondJson(res, { success: true });
                    this.log(`[Mute][Discord:SetMute][Success]`, `${mute ? 'Muted' : 'Unmuted'} ${id}`);
                } catch (err) {
                    respondJson(res, { success: false, errorId: 'DISCORD_ERROR', errorMsg: err });
                    this.error(`[Mute][Discord:SetMute][Error]`, `${mute ? 'Mute' : 'Unmute'}: ${id} - ${err}`);
                }
                break;
            case "keep_alive":
                respondJson(res, { success: true });
                this.log('[KeepAlive][Request]', params);
                break;
            case "sync":
                respondJson(res, {
                    success: true,
                    version: "1.3.0",
                    debugMode: this.debug,
                    discordGuild: this.guild?.id,
                    discordChannel: CHANNEL_ID,
                });
                this.log('[Sync][Request]', params);
                break;
        }
    }

}