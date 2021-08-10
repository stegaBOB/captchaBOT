/**
 * @author Sammy (stegaBOB)
 *
 * @dev If you want to start up a captchaBOT on your own, add a .env file that contains
 *      `BOT_TOKEN="YOUR BOT TOKEN HERE"` or just replace the process.env.BOT_TOKEN
 *      in client.login with your token. Also, make sure to enable "SERVER MEMBERS INTENT"
 *      under the "Privileged Gateway Intents" section in the Bot category on the Discord bot page.
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

// Connection URL
const url = 'mongodb://localhost:27017';
const mongoClient = new MongoClient(url);

// Database Name
const dbName = 'captchaBOT';
let dataCollection;
let messagesCollection;

let ids = null;
let startMessage = null;

let isMessageSet = false;


const { Client, Intents } = require('discord.js');

const client = new Client({
	intents:
		[Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGE_REACTIONS],
});

client.once('ready', async () => {
	await initializeDatabase()
		.then(console.log)
		.catch(console.error);
	console.log('I am ready!');
	if (await checkIfInitialized()) {
		try {
			let newReactionMessage = await client.channels.fetch(startMessage.channelId);
			newReactionMessage = await newReactionMessage.messages.fetch(startMessage.messageId);
			await doStartFunction(newReactionMessage);
		}
		catch (e) {
			console.error(e);
			console.log(`Cannot find message with id: ${startMessage.messageId}`);
		}
	}
});

client.on('messageCreate', async message => {
	try {
		if (!message.channel.guild || message.member === null) return;
		if (message.member.permissions.has('ADMINISTRATOR') || message.member.roles.cache.find(r => r.name === 'Moderator')) {
			if (message.content.toLowerCase().startsWith('%start')) {
				if (await checkIfReady()) {
					await deleteReactionMessage();
					const reactionMessage = await message.channel.send('React to this message to get verified!');
					console.log(`${message.member.user.tag} started the reaction message!`);
					setTimeout(() => message.delete(), 1000);
					await dataCollection.updateOne({ name: 'savedIds' }, { $set:
							{
								verificationGuildId: message.guildId,
							},
					});
					ids = await dataCollection.findOne({ name: 'savedIds' });
					await setStartMessage(reactionMessage);
					await doStartFunction(reactionMessage);
				}
				else {
					console.log('Not yet initialized');
				}
			}
			else if (message.content.toLowerCase().startsWith('%setmainguild')) {
				await doSetMainGuild(message);
			}
			else if (message.content.toLowerCase().startsWith('%setmemberrole')) {
				await doSetMemberRole(message);
			}
			else if (message.content.toLowerCase().startsWith('%reset')) {
				await doReset(message);
			}
		}
	}
	catch (e) {
		console.error(e);
	}
});

client.on('guildMemberAdd', async member => {
	if (!isMessageSet || !(await checkIfInitialized())) {
		return;
	}
	try {
		const guild = member.guild;
		const theObj = {
			user: member.user,
			tG: await client.guilds.fetch(ids.mainGuildId),
			vG: await client.guilds.fetch(ids.verificationGuildId),
		};

		console.log(`TG = ${theObj.tG.toString()}`);
		console.log(`VG = ${theObj.vG.toString()}`);
		console.log(`guild = ${guild.toString()}`);

		const memberObj = await recheckMembers(theObj);
		if (guild.id === ids.mainGuildId) {
			if (memberObj.vG) {
				await memberObj.vG.kick('Must join the main server first!');
				console.log(`${theObj.user.tag} must join the main server first!`);
			}
			else {
				console.log(`${theObj.user.tag}'s countdown has started.`);
				beginCountdown(theObj);
			}
		}
		else if (guild.id === ids.verificationGuildId) {
			console.log(`TG membership = ${memberObj.tG}`);
			if (!memberObj.tG) {
				await memberObj.vG.kick('Must join the main server first!');
				console.log(`${theObj.user.tag} must join the main server first!`);
			}
			else if (memberObj.tG.roles.cache.has(ids.memberRoleId)) {
				await memberObj.vG.kick('User already has member role!');
				console.log(`${theObj.user.tag} already has member role!`);
			}
			else {
				console.log(`${theObj.user.tag}'s backup countdown has started.`);
				beginCountdown(theObj);
			}
		}
	}
	catch (e) {
		console.error(e);
	}
});

async function initializeDatabase() {
	await mongoClient.connect();
	console.log('Successfully connected to database');
	const db = mongoClient.db(dbName);
	dataCollection = db.collection('data');
	ids = await dataCollection.findOne({ name: 'savedIds' });
	messagesCollection = db.collection('messages');
	startMessage = await messagesCollection.findOne({ name: 'startMessage' });
	isMessageSet = (startMessage.messageId !== null);
	return 'Connected to collections';
}

async function checkIfInitialized() {
	return !(!isMessageSet || ids.mainGuildId === null || ids.verificationGuildId === null || ids.memberRoleId === null
	|| ids.verificationGuildId !== startMessage.guildId);
}

async function checkIfReady() {
	return !(ids.mainGuildId === null || ids.memberRoleId === null);
}

async function setStartMessage(reactionMessage) {
	await messagesCollection.updateOne({ name: 'startMessage' }, { $set:
			{
				guildId: reactionMessage.guildId,
				channelId: reactionMessage.channelId,
				messageId: reactionMessage.id,
			},
	});
	startMessage = await messagesCollection.findOne({ name: 'startMessage' });
	isMessageSet = true;
}

async function doStartFunction(reactionMessage) {
	await reactionMessage.react('👍');
	const filter = (reaction) => reaction.emoji.name === '👍';

	const collector = reactionMessage.createReactionCollector({ filter });

	collector.on('collect', async (reaction, user) => {
		const theObj = {
			user: user,
			tG: await client.guilds.fetch(ids.mainGuildId),
			vG: await client.guilds.fetch(ids.verificationGuildId),
		};
		const memberObj = await recheckMembers(theObj);
		if (memberObj.tG.permissions.has('ADMINISTRATOR')) {
			console.log(`I can't kick ${memberObj.tG.user.tag}.`);
			return;
		}
		console.log(`${user.tag} successfully verified!`);
		await memberObj.vG.kick(`${user.tag} successfully verified!`);
		const memberRole = await theObj.tG.roles.fetch(ids.memberRoleId);
		await memberObj.tG.roles.add(memberRole);
		console.log(`Member role added to ${user.tag}!`);
	});
}

function beginCountdown(theObj) {
	try {
		setTimeout(async () => {
			const memberObj = await recheckMembers(theObj);
			if (memberObj.tG.roles.cache.size > 1) {
				console.log(`${theObj.user.tag} is verified! ID = ${theObj.user.id}`);
				if (memberObj.vG) {
					memberObj.vG.kick('User has verified successfully!')
						.catch(err => console.error(err));
				}
			}
			else {
				console.log(`${theObj.user.tag} has not verified in time! Attempting to kick now. ID = ${theObj.id}`);
				if (memberObj.vG) {
					memberObj.vG.kick('User has not verified!')
						.catch(err => console.error(err));
				}
				if (memberObj.tG) {
					memberObj.tG.kick('User has not verified!')
						.catch(err => console.error(err));
				}
			}
		}, 450000);
	}
	catch (e) {
		console.error(e);
	}
}

async function recheckMembers(theObj) {
	let tgMemberTest;
	let vgMemberTest;
	try {
		tgMemberTest = await theObj.tG.members.fetch({ user: theObj.user, force: false });
	}
	catch (e) {
		tgMemberTest = null;
	}
	try {
		vgMemberTest = await theObj.vG.members.fetch({ user: theObj.user, force: false });
	}
	catch (e) {
		vgMemberTest = null;
	}
	return {
		tG: tgMemberTest,
		vG: vgMemberTest,
	};
}

async function doSetMainGuild(message) {
	const mainGuildId = message.guildId;
	await dataCollection.updateOne({ name: 'savedIds' }, { $set:
			{
				mainGuildId: mainGuildId,
			},
	});
	ids = await dataCollection.findOne({ name: 'savedIds' });
	console.log(`mainGuildId = ${ids.mainGuildId}`);

	message.channel.send(`Updated main guild id to ${ids.mainGuildId}.`);
}

async function doSetMemberRole(message) {
	if (ids.mainGuildId == null) {
		message.channel.send('Please set main guild id first.');
		console.log('Main guild id not set.');
		return;
	}
	const theId = message.content.split(' ')[1];
	await dataCollection.updateOne({ name: 'savedIds' }, { $set:
			{
				memberRoleId: theId,
			},
	});
	ids = await dataCollection.findOne({ name: 'savedIds' });
	console.log(`memberRoleId = ${ids.memberRoleId}`);
	message.channel.send(`Updated member role id to ${ids.memberRoleId}.`);
}

async function doReset(message) {
	await deleteReactionMessage();
	await dataCollection.updateOne({ name: 'savedIds' }, { $set:
			{
				memberRoleId: null,
				mainGuildId: null,
				verificationGuildId: null,
			},
	});
	ids = await dataCollection.findOne({ name: 'savedIds' });

	await messagesCollection.updateOne({ name: 'startMessage' }, { $set:
			{
				channelId: null,
				messageId: null,
				guildId: null,
			},
	});
	startMessage = await messagesCollection.findOne({ name: 'startMessage' });

	console.log('All data reset');
	message.channel.send('All data reset');
}

async function deleteReactionMessage() {
	if (startMessage.messageId != null) {
		try {
			let oldReactionMessage = await client.channels.fetch(startMessage.channelId);
			oldReactionMessage = await oldReactionMessage.messages.fetch(startMessage.messageId);
			setTimeout(() => {
				oldReactionMessage.delete();
				console.log('Old reaction message deleted');
			}, 1000);
		}
		catch (e) {
			console.error(e);
			console.log(`Cannot find message with id: ${startMessage.messageId}`);
		}
	}
}

client.login(process.env.BOT_TOKEN);