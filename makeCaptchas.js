const path = require('path'),
	fs = require('fs'),
	Captcha = require('@haileybot/captcha-generator');
const { MongoClient } = require('mongodb');
// Connection URL
const url = 'mongodb://localhost:27017';
const mongoClient = new MongoClient(url);

// Database Name
const dbName = 'captchaBOT';
let dataCollection;

const captcha = require('trek-captcha')

// let captchaSolutions = [];
async function run() {
	// for (let i = 0; i < 1000; i++) {
	// 	const { token, buffer } = await captcha({ size: 5, style: 0 })
	// 	await fs.createWriteStream(`captchas/${i}.jpeg`).on('finish', () => captchaSolutions.push(token)).end(buffer)
	// }

	await mongoClient.connect();
	console.log('Successfully connected to database');
	const db = mongoClient.db(dbName);
	dataCollection = db.collection('data');
	let captchaSolutions = await dataCollection.findOne({ name: 'captchaSolutions' });
	console.log(captchaSolutions.solutions.length);
	// solutions: captchaSolutions };
	// await dataCollection.insertOne(doc);
}

run()
