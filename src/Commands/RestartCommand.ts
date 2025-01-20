import { SlashCommandBuilder, Permissions, Client, Interaction, CacheType, CommandInteraction, PermissionsBitField } from "discord.js";
import EventEmitter from "events";
import Command from "../Command";

export default class RestartCommand extends Command {
    data = new SlashCommandBuilder();
    permissions = [PermissionsBitField.Flags.Administrator];

    constructor() {
        super()
        this.data
        .setName("restart")
        .setDescription("Restarts Hahnrich")
    }
    async execute(client: Client, interaction: CommandInteraction, events?: EventEmitter): Promise<boolean> {
        if(!events) throw new Error("No EventEmitter, can't restart!");

        interaction.reply("Requesting restart o7");

        client.emit("RequestRestart");

        return true;
    }

}