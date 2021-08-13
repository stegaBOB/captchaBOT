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

const characterArray = 'abcdefghijklmnopqrstuvwxyza'.split('');

// Database Name
const dbName = 'captchaBOT';
let dataCollection;
let messagesCollection;

let ids = null;
let startMessage = null;

let isMessageSet = false;

let captchaSolutions;

let solvingCaptchaSet = new Set();

const { Client, Intents, MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
const Discord = require('discord.js');

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

					const theEmbed = {
						color: ('#3ba55c'),
						title: 'Server Verification',
						description: 'Click the green button below to get verified! Complete the verification' +
								' promptly or risk being kicked!',
						timestamp: new Date(),
						footer: {
							text: '©captchaBOT',
							icon_url: 'https://cdn.discordapp.com/avatars/873124659057537074/b756a46fe35a457b89001b3960382606.png?size=256',
						},
					};
					const row = new MessageActionRow()
						.addComponents(
							new MessageButton()
								.setCustomId('getVerified')
								.setLabel('Get Verified!')
								.setStyle('SUCCESS'),
						);
					const reactionMessage = await message.channel.send({ embeds: [theEmbed], components: [row] });
					console.log(`${message.member.user.tag} started the reaction message!`);
					setTimeout(() => {
						message.delete();
						console.log('Initialization message deleted');
					}, 1000);
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
	captchaSolutions = await dataCollection.findOne({ name: 'captchaSolutions' });
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
	const collector = reactionMessage.createMessageComponentCollector({ componentType: 'BUTTON' });

	collector.on('collect', async startInteraction => {
		if(!startInteraction.isButton) return;
		if(startInteraction.customId !== 'getVerified') return;
		await startInteraction.deferReply({ ephemeral: true });
		if (solvingCaptchaSet.has(startInteraction.user)){
			const waitEmbed = {
				color: ('#3ba55c'),
				description: 'You are currently solving a captcha. If you dismissed the message, please wait 60 seconds' +
					' for the captcha to expire.',
			};
			await startInteraction.editReply({ embeds: [waitEmbed], ephemeral: true });
			return;
		} else {
			solvingCaptchaSet.add(startInteraction.user);
			setTimeout(() => {
				solvingCaptchaSet.delete(startInteraction.user);
			}, 60000)
		}
		const randomInt = Math.floor(1000*Math.random());
		const solution = captchaSolutions.solutions[randomInt].split('');
		console.log(solution);
		const theEmbed = {
			color: ('#3ba55c'),
			title: 'Captcha',
			description: 'Select the buttons that match with the captcha image. You will have three tries.',
			image: {
				url: `https://captchahosting.web.app/captchas/${randomInt}.jpeg`,
			},
			footer: {
				text: 'Inspired by Darkmatter\'s Cryptographer',
			},
		};

		let tD = [];
		for (let i = 0; i < 5; i++) {
			tD.push(Math.floor(4*Math.random()));
		}
		let rD1 = [];
		for (let i = 0; i < 5; i++) {
			rD1.push(Math.floor(26*Math.random()));
		}
		let rD2 = [];
		for (let i = 0; i < 5; i++) {
			rD2.push(Math.floor(26*Math.random()));
		}
		let rD3 = [];
		for (let i = 0; i < 5; i++) {
			rD3.push(Math.floor(26*Math.random()));
		}
		let rD4 = [];
		for (let i = 0; i < 5; i++) {
			rD4.push(Math.floor(26*Math.random()));
		}

		const buttonRows = makeButtonRows(solution, tD, rD1, rD2, rD3, rD4, 0);

		let buttonMessage = await startInteraction.editReply({ embeds: [theEmbed], components: buttonRows.actionRows, ephemeral: true });

		const buttonMessageCollector = buttonMessage.createMessageComponentCollector({ componentType: 'BUTTON' });

		buttonMessageCollector.on('collect', async captchaInteraction => {
			await captchaInteraction.deferUpdate();
			let customId = captchaInteraction.customId;
			const column = customId % 5;
			const newBtnRowsObj = makeButtonRows(solution, tD, rD1, rD2, rD3, rD4, column+1);
			if (solution[column] === newBtnRowsObj.labelArray[customId]){
				let buttonMessage = await startInteraction.editReply({ embeds: [theEmbed], components: newBtnRowsObj.actionRows, ephemeral: true });
			} else {
				console.log("whoops");
			}
		});

		// doCaptchaSuccess(interaction);
	});
}

async function doCaptchaSuccess(interaction){
	const theObj = {
		user: interaction.user,
		tG: await client.guilds.fetch(ids.mainGuildId),
		vG: await client.guilds.fetch(ids.verificationGuildId),
	};

	const memberObj = await recheckMembers(theObj);
	if (memberObj.tG.permissions.has('ADMINISTRATOR')) {
		console.log(`I can't kick ${memberObj.tG.user.tag}.`);
		return;
	}
	console.log(`${interaction.user.tag} successfully verified!`);
	await memberObj.vG.kick(`${i.user.tag} successfully verified!`)
		.catch(error => console.error(error));
	const memberRole = await theObj.tG.roles.fetch(ids.memberRoleId);
	await memberObj.tG.roles.add(memberRole);
	console.log(`Member role added to ${interaction.user.tag}!`);
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
			}, 5000);
		}
		catch (e) {
			console.error(e);
			console.log(`Cannot find message with id: ${startMessage.messageId}`);
		}
	}
}

function makeButtonRows(solution, tD, rD1, rD2, rD3, rD4, column) {
	const labelArray = [];
	for (let i = 0; i < 5; i++) {
		labelArray[i] = (tD[i] === 0)? solution[i] : (characterArray[rD1[i]] === solution[i])? characterArray[rD1[i]+1] : characterArray[rD1[i]];
		labelArray[i+5] = (tD[i] === 1)? solution[i] : (characterArray[rD2[i]] === solution[i])? characterArray[rD2[i]+1] : characterArray[rD2[i]];
		labelArray[i+10] = (tD[i] === 2)? solution[i] : (characterArray[rD3[i]] === solution[i])? characterArray[rD3[i]+1] : characterArray[rD3[i]];
		labelArray[i+15] = (tD[i] === 3)? solution[i] : (characterArray[rD4[i]] === solution[i])? characterArray[rD4[i]+1] : characterArray[rD4[i]];
	}

	const styleArray = [];
	for(let i = 0; i < 5; i++){
		styleArray[i] = ((column === i)? 'PRIMARY' : (labelArray[i] !== solution[i])? 'SECONDARY' : (column > i)? 'SUCCESS' : 'SECONDARY');
		styleArray[i+5] = ((column === i)? 'PRIMARY' : (labelArray[i+5] !== solution[i])? 'SECONDARY' : (column > i)? 'SUCCESS' : 'SECONDARY');
		styleArray[i+10] = ((column === i)? 'PRIMARY' : (labelArray[i+10] !== solution[i])? 'SECONDARY' : (column > i)? 'SUCCESS' : 'SECONDARY')
		styleArray[i+15] = ((column === i)? 'PRIMARY' : (labelArray[i+15] !== solution[i])? 'SECONDARY' : (column > i)? 'SUCCESS' : 'SECONDARY')
	}

	const row0 = new MessageActionRow()
		.addComponents(
			new MessageButton()
				.setCustomId('0')
				.setLabel(labelArray[0])
				.setStyle(styleArray[0])
				.setDisabled(column !== 0),
			new MessageButton()
				.setCustomId('1')
				.setLabel(labelArray[1])
				.setStyle(styleArray[1])
				.setDisabled(column !== 1),
			new MessageButton()
				.setCustomId('2')
				.setLabel(labelArray[2])
				.setStyle(styleArray[2])
				.setDisabled(column !== 2),
			new MessageButton()
				.setCustomId('3')
				.setLabel(labelArray[3])
				.setStyle(styleArray[3])
				.setDisabled(column !== 3),
			new MessageButton()
				.setCustomId('4')
				.setLabel(labelArray[4])
				.setStyle(styleArray[4])
				.setDisabled(column !== 4),
		);
	const row1 = new MessageActionRow()
		.addComponents(
			new MessageButton()
				.setCustomId('5')
				.setLabel(labelArray[5])
				.setStyle(styleArray[5])
				.setDisabled(column !== 0),
			new MessageButton()
				.setCustomId('6')
				.setLabel(labelArray[6])
				.setStyle(styleArray[6])
				.setDisabled(column !== 1),
			new MessageButton()
				.setCustomId('7')
				.setLabel(labelArray[7])
				.setStyle(styleArray[7])
				.setDisabled(column !== 2),
			new MessageButton()
				.setCustomId('8')
				.setLabel(labelArray[8])
				.setStyle(styleArray[8])
				.setDisabled(column !== 3),
			new MessageButton()
				.setCustomId('9')
				.setLabel(labelArray[9])
				.setStyle(styleArray[9])
				.setDisabled(column !== 4),
		);
	const row2 = new MessageActionRow()
		.addComponents(
			new MessageButton()
				.setCustomId('10')
				.setLabel(labelArray[10])
				.setStyle(styleArray[10])
				.setDisabled(column !== 0),
			new MessageButton()
				.setCustomId('11')
				.setLabel(labelArray[11])
				.setStyle(styleArray[11])
				.setDisabled(column !== 1),
			new MessageButton()
				.setCustomId('12')
				.setLabel(labelArray[12])
				.setStyle(styleArray[12])
				.setDisabled(column !== 2),
			new MessageButton()
				.setCustomId('13')
				.setLabel(labelArray[13])
				.setStyle(styleArray[13])
				.setDisabled(column !== 3),
			new MessageButton()
				.setCustomId('14')
				.setLabel(labelArray[14])
				.setStyle(styleArray[14])
				.setDisabled(column !== 4),
		);
	const row3 = new MessageActionRow()
		.addComponents(
			new MessageButton()
				.setCustomId('15')
				.setLabel(labelArray[15])
				.setStyle(styleArray[15])
				.setDisabled(column !== 0),
			new MessageButton()
				.setCustomId('16')
				.setLabel(labelArray[16])
				.setStyle(styleArray[16])
				.setDisabled(column !== 1),
			new MessageButton()
				.setCustomId('17')
				.setLabel(labelArray[17])
				.setStyle(styleArray[17])
				.setDisabled(column !== 2),
			new MessageButton()
				.setCustomId('18')
				.setLabel(labelArray[18])
				.setStyle(styleArray[18])
				.setDisabled(column !== 3),
			new MessageButton()
				.setCustomId('19')
				.setLabel(labelArray[19])
				.setStyle(styleArray[19])
				.setDisabled(column !== 4),
		);
	return { actionRows: [row0, row1, row2, row3], labelArray: labelArray };
}

client.login(process.env.BOT_TOKEN);