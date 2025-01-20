import { SlashCommandBuilder, Permissions, Client, Interaction, CacheType, CommandInteraction, PermissionsBitField, ContextMenuCommandBuilder, PermissionResolvable, BaseGuildTextChannel, Message, EmbedBuilder, MessageResolvable } from "discord.js";
import EventEmitter from "events";
import Command from "../Command";

export default class RandomQuoteCommand extends Command {
    data = new SlashCommandBuilder();
    permissions = [PermissionsBitField.Flags.Administrator];

    constructor() {
        super()
        this.data
        .setName("quote")
        .setDescription("Responds with a random quote from #quotes")
    }

    async execute(client: Client, interaction: CommandInteraction<CacheType>, events?: EventEmitter | undefined): Promise<boolean> {
        await interaction.deferReply();
        const channel = client.channels.cache.get("680512808600862721");
        if(channel instanceof BaseGuildTextChannel) {
            try {
                let messageArray: Message[] = [];
                let lastMessages = await channel.messages.fetch({limit: 100 })
                let numberfetched = 0;
                do {
                    messageArray = messageArray.concat(Array.from(lastMessages.values()));
                    lastMessages = await channel.messages.fetch({after: Array.from(lastMessages.keys())[0+numberfetched],limit: 100 })
                    numberfetched += lastMessages.size;
                    //console.log("size of Array:", numberfetched+100, "last message:", messageArray[messageArray.length-1]);
                } while(lastMessages.size > 0);
                let rng: number;
                let result: Message;
                do {
                    result = messageArray[Math.floor(Math.random() * messageArray.length)];
                } while(
                    //messageArray[rng].attachments.size > 0 ||
                    result.mentions.repliedUser !== null ||
                    result.system ||
                    (
                        result.content.startsWith("https://") && 
                        !result.content.endsWith(".gif") &&
                        !result.content.endsWith(".png") &&
                        !result.content.endsWith(".jpg")
                        )
                )

                const embed = new EmbedBuilder();
                result.content ? embed.setTitle(result.content) : embed.setTitle(" ");
                let url = "";
                let temp = result.author.avatarURL();
                if(temp !== null) {
                    url = temp;
                }
                const avatarURL: string = url;
                embed.setAuthor({
                    name: result.author.username,
                    iconURL: avatarURL,
                    url: result.url,
                })

                embed.setFooter({ text: new Date(result.createdTimestamp).toLocaleString()});

                if(result.attachments.size > 0)
                    embed.setImage(Array.from(result.attachments.values())[0].url);
                if(result.content.startsWith("https://"))
                    embed.setImage(result.content);

                console.log(result)
                interaction.editReply({embeds: [embed]});
            } catch(e) {
                this.error("Error in RandomQuoteCommand:",e)
                interaction.editReply("Sorry, I ran into a problem. This might be caused by to many requests to the Discord-API.\nThis error has been logged!")
            }

        } else {
            console.log("not a text channel")
        }
        return true
    }
}