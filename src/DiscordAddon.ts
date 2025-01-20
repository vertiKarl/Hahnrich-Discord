import EventEmitter from "events";
import Logger from "../../Utils/Logger";
import { Client } from "discord.js";

export default abstract class DiscordAddon extends Logger {
    emoji = '🎮🅰️'

    static events = new EventEmitter();
    abstract name: string
    abstract description: string

    abstract execute(client: Client): Promise<boolean>
    abstract stop(): void
}