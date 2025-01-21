import { GatewayIntentBits, Partials, Interaction, SlashCommandBuilder, ApplicationCommandType, ApplicationCommandOptionType, ActivityType, ContextMenuCommandBuilder, Client, PresenceData} from "discord.js";
import Command from "./Command";
import Commands from "./Commands"
import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v9";
import EventEmitter from "events";
import DiscordAddon from "./DiscordAddon";
import DiscordAddons from "./DiscordAddons";
import TTTMuter from "./TTTMuter/TTTMuter";
import { Plugin } from "../hahnrich";

const defaultSettings = {
    token: "",
    clientId: "",
    guildIds: [""]
};

interface Settings {
    token: string,
    clientId: string,
    guildIds: string[]
}

function validateSettings(settings: Settings | undefined) {
    if(!settings) return false;
    return (
        settings.clientId.length > 5 &&
        settings.token.length > 5 &&
        settings.guildIds.length > 0 &&
        settings.guildIds[0].length > 5
    );
}

/**
 * A plugin for interaction on the realtime chat application Discord!
 */
export class DiscordPlugin extends Plugin {
    name = "Discord";
    description = "A Discord-bot for Hahnrich";
    emoji = '🎮';
    events = new EventEmitter();
    client?: Client;
    settings?: Settings;
    HahnrichVersion = "";

    addons = new Map<string, DiscordAddon>();

    /**
     * Adds a addon instance to the addons map to keep
     * it in memory and allow runtime manipulation.
     * @param addon A addon instance to import to addons map
     */
    async loadAddon(addons: DiscordAddon): Promise<void> {
        if(!this.client) return;

        this.debug("Addon '"+addons.name+"' starting!")
        this.addons.set(addons.name, addons);
        
        addons.execute(this.client).then(() => {
            this.log("Addon", addons.name, "started!");
        }).catch(err => {
            this.error("Addon", addons.name, "failed starting =>", err);
        })
    }

    /**
     * Removes Addon-instance from addons map which in turn
     * lets it get catched by garbage collection.
     * @param addon The addon instance to detach from addons map
     */
    unloadAddon(addon: DiscordAddon): void {
        this.debug(this.addons.has(addon.name));
        addon.stop();
        if(this.addons.has(addon.name)) {
            this.addons.delete(addon.name);
            this.log("Addon "+addon.name+" unloaded!")
        }
    }

    commands = new Map<string, Command>()

    /**
     * Loads all commands specified in ./Discord/Commands.ts
     * @returns A list of all enabled commands
     */
    loadCommands(): Array<Command> {
        const commands: Array<Command> = []
        Commands.forEach(command => {
            commands.push(new command());
        })

        return commands;
    }

    /**
     * Initializes the instance by requesting to put the application commands
     * into the discord api
     * @returns Success-state
     */
    async init(): Promise<void> {
        return new Promise((resolve, reject) => {
            if(!this.settings || !validateSettings(this.settings)) return false;

            this.events.on("VERSION", (version) => {
                this.debug("Setting HahnrichVersion to", version)
                this.HahnrichVersion = version;
                this.updateRPC();
            })

            this.events.emit("GET_VERSION"); // Get Hahnrich version to display on discord rpc

            const rest = new REST().setToken(this.settings.token);
            const commands = this.loadCommands();
            const commandData: Array<SlashCommandBuilder|ContextMenuCommandBuilder> = [];
            commands.forEach(command => {
                this.commands.set(command.data.name, command);
                commandData.push(command.data);
            })

            for(let guild of this.settings.guildIds) {
                // clean up guild commands
                rest.put(Routes.applicationGuildCommands(this.settings.clientId, guild), { body: [] })
                    .then(() => this.log('Successfully cleaned up guild commands.'))
                    .catch(console.error);
                // push current ones
                rest.put(
                    Routes.applicationGuildCommands(this.settings.clientId, guild),
                    { body: commandData }
                )
                .then(() => {
                    this.log("Successfully registered application commands!")
                    return resolve();
                })
                .catch(err => {
                    this.error("Failed registering application commands!", err)
                    return reject();
                })
            }
        })
    }

    updateRPC() {
        if(!this.client?.user) return;
        const presence: PresenceData = {
            status: "online",
            activities: [{
                        name: `Version ${this.HahnrichVersion}`,
                        type: ActivityType.Streaming,
                        url: "https://twitch.tv/vertiKarl"
                }]
        };

        this.debug("Updating rich presence to", presence);

        this.client.user.setPresence(presence);
    }

    /**
     * Starts the Discord-client and starts the interactionHandler
     * @returns Success-state
     */
    async execute(): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if(!this.settings) {
                this.error("Please fill out the config.json!");
                this.settings = defaultSettings;
                this.events.emit("SAVE_SETTINGS");
                return reject();
                this.debug("PAST SETTINGS")
            }

            try {
                await this.init()
            } catch(err) {
                this.error("INIT", err);
                return reject()
            };
    
    
            const client = new Client({
                intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
            })
    
            this.client = client;
    
            client.on('ready', () => {
                if(!client?.user) return;
    
                this.log(`Logged in as ${client.user.tag}`);

                this.updateRPC();
                           
    
                DiscordAddons.forEach((addon) => {
                    const instance = new(addon)();
                    this.loadAddon(instance);
                })
            })
    
            client.on("RequestRestart", () => {
                this.events.emit("RESTART", this);
            })
    
            client.on('interactionCreate', (interaction) => this.interactionHandler(client, interaction, this.events));
    
            client.login(this.settings.token);
    
            return resolve();
        })
    }

    async stop() {
        this.log("Stopping Discord bot.");
        await this.client?.destroy();
    }

    /**
     * Handles the behavior when receiving interactions from discord
     * @param client The discord client
     * @param interaction The interaction itself
     * @param events The eventemitter which connects the plugins
     * @returns The success-state of the processing
     */
    async interactionHandler(client: Client, interaction: Interaction, events: EventEmitter): Promise<void> {
        if(!interaction.isCommand()) return;

        const command = this.commands.get(interaction.commandName)
        if(!command) return;
        if(command.permissions.length > 0) {
            if(!interaction.member?.permissions || typeof interaction.member?.permissions === "string") return;

            if(!interaction.member?.permissions?.has(command.permissions)) {
                await interaction.reply({ ephemeral: true, content: "Insufficient permissions!"});
                return;
            }
        }

        try {
            const result = await command.execute(client, interaction, events);
            if(!result && !(interaction.replied  || interaction.deferred)) {
                await interaction.reply("Sorry, something went wrong!");
            }
        } catch(err) {
            console.error("Unhandled error in DiscordPlugin:", err)
            if(!(interaction.replied  || interaction.deferred)) {
                await interaction.reply("Failed executing command!")
            } else {
                await interaction.editReply("Failed executing command!");
            }
        }

        
    }
}

export default new DiscordPlugin();