/**
 * @author Sammy (stegaBOB)
 *
 * @dev If you want to start up a captchaBOT on your own, add a .env file that contains
 *      `BOT_TOKEN="YOUR BOT TOKEN HERE"` or just replace the process.env.BOT_TOKEN
 *      in client.login with your token. Also, make sure to enable "SERVER MEMBERS INTENT"
 *      under the "Privileged Gateway Intents" section in the Bot category on the Discord bot page.
 */

require('dotenv').config();
const {Client, Intents} = require("discord.js");
const client = new Client({
    intents:
        [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGE_REACTIONS]
});
client.on('ready', () => {
    console.log("I am ready!");
});

const TEST_GUILD_ID = "872840235560615976";
const VERIFICATION_GUILD_ID = "872840235124412416";
const MEMBER_ROLE_ID = "872840740106022912";

let verificationSet = new Set();


client.on('message', async message => {
    try {
        if (!message.channel.guild || message.member === null) return;
        if (message.member.permissions.has("ADMINISTRATOR") || message.member.roles.cache.find(r => r.name === "Moderator")) {
            if (message.content.toLowerCase().startsWith("%start")) {
                let reactionMessage = await message.channel.send("React to this message to get verified!");
                console.log(`${message.member.user.tag} started the reaction message!`);
                await reactionMessage.react('👍');
                setTimeout(() => message.delete(), 1000);
                const filter = (reaction, user) => reaction.emoji.name === '👍';

                const collector = reactionMessage.createReactionCollector(filter);

                collector.on('collect', async (reaction, user) => {
                    verificationSet.add(user);
                    let theObj = {
                        user: user,
                        tG: await client.guilds.fetch(TEST_GUILD_ID),
                        vG: await client.guilds.fetch(VERIFICATION_GUILD_ID),
                    }
                    const memberObj = await recheckMembers(theObj);
                    if (memberObj.tG.permissions.has("ADMINISTRATOR")) {
                        console.log(`I can't kick ${memberObj.tG.user.tag}.`);
                        return;
                    }
                    console.log(`${user.tag} successfully verified!`);
                    await memberObj.vG.kick(`${user.tag} successfully verified!`);
                    const memberRole = await theObj.tG.roles.fetch(MEMBER_ROLE_ID);
                    await memberObj.tG.roles.add(memberRole);
                    console.log(`Member role added to ${user.tag}!`);
                });
            }
        }
    } catch (e) {
        console.error(e);
    }
});


client.on('guildMemberAdd', async member => {
    try {
        const guild = member.guild;
        let theObj = {
            user: member.user,
            tG: await client.guilds.fetch(TEST_GUILD_ID),
            vG: await client.guilds.fetch(VERIFICATION_GUILD_ID),
        }
        console.log(`TG = ${theObj.tG.toString()}`);
        console.log(`VG = ${theObj.vG.toString()}`);
        console.log(`guild = ${guild.toString()}`);

        const memberObj = await recheckMembers(theObj);
        if (guild.id === TEST_GUILD_ID) {
            if (memberObj.vG) {
                await memberObj.vG.kick("Must join the main server first!");
                console.log(`${theObj.user.tag} must join the main server first!`);
            } else {
                console.log(`${theObj.user.tag}'s countdown has started.`);
                beginCountdown(theObj);
            }
        } else if (guild.id === VERIFICATION_GUILD_ID) {
            console.log(`TG membership = ${memberObj.tG}`);
            const memberRole = await theObj.tG.roles.fetch(MEMBER_ROLE_ID);
            if (!memberObj.tG) {
                await memberObj.vG.kick("Must join the main server first!");
                console.log(`${theObj.user.tag} must join the main server first!`);
            } else if (verificationSet.has(theObj.user)){
                await memberObj.vG.kick("User already verified!");
                console.log(`${theObj.user.tag} is already verified!`);
            } else if (memberObj.tG.roles.cache.has(memberRole)){
                await memberObj.vG.kick("User already has member role!");
                console.log(`${theObj.user.tag} already has member role!`);
            }
        }
    } catch (e) {
        console.error(e);
    }
});

function beginCountdown(theObj) {
    try {
        setTimeout(async () => {
            const memberObj = await recheckMembers(theObj);
            if (verificationSet.has(theObj.user) || memberObj.tG.roles.cache.size > 1) {
                console.log(`${theObj.user.tag} is verified! ID = ${theObj.user.id}`);
                if (memberObj.vG) {
                    memberObj.vG.kick("User has verified successfully!")
                        .catch(err => console.error(err));
                }
            } else {
                console.log(`${theObj.user.tag} has not verified in time! Attempting to kick now. ID = ${theObj.id}`);
                if (memberObj.vG) {
                    memberObj.vG.kick("User has not verified!")
                        .catch(err => console.error(err));
                }
                if (memberObj.tG) {
                    memberObj.tG.kick("User has not verified!")
                        .catch(err => console.error(err));
                }
            }
        }, 450000);
    } catch (e) {
        console.error(e);
    }
}

async function recheckMembers(theObj){
    let tgMemberTest;
    let vgMemberTest;
    try {
        tgMemberTest = await theObj.tG.members.fetch({user: theObj.user, force: false});
    } catch (e) {
        tgMemberTest = null;
    }
    try {
        vgMemberTest = await theObj.vG.members.fetch({user: theObj.user, force: false});
    } catch (e) {
        vgMemberTest = null;
    }
    return {
        tG: tgMemberTest,
        vG: vgMemberTest,
    }
}


client.login(process.env.BOT_TOKEN);