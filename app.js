"use strict";
var crypto = require('crypto');
var fs = require("fs");
var messagebird_api = require('messagebird');
var messagebird;

function init() {
	
	// Set defaults
	if(typeof(Homey.manager('settings').get( 'messagebird.sender' )) === 'undefined')
	{
		Homey.manager('settings').set( 'messagebird.sender', '')
	}
	
	if(typeof(Homey.manager('settings').get( 'messagebird.translate' )) === 'undefined')
	{
		Homey.manager('settings').set( 'messagebird.translate', true)
	}
	
	// Create Log
	Homey.manager('insights').createLog( 'messagebird_credit', {
		label: {
			en: 'MessageBird Credits'
		},
		type: 'number',
		units: {
			en: ''
		},
		decimals: 2,
		chart: 'stepLine'
	}, function (err , success){});

	
	// Reinitialise messagebird api when the key changes.
	// Fire once on init, even when no api keys is set. Lazy way to prevent errors :) 
	Homey.manager('settings').on( 'set', (valname) => {
		if(valname == 'messagebird.apikey')
		{
			var apikey = Homey.manager('settings').get( 'messagebird.apikey' )
			Homey.log('MessageBird API Key:', apikey);
			messagebird = module.exports.messagebird = messagebird_api(apikey);
			getBalance();
		}
	} ).emit( 'set', 'messagebird.apikey' );
	setInterval(getBalance, 3600000);
	
	// Register webhook for receiving messages
	Homey.manager('cloud').getHomeyId(
		function callback(err, cloudId) {
			var homeyId = crypto.createHash('sha256').update(cloudId).digest('base64').replace(/=+$/, '');
			Homey.manager('settings').set( 'webhookUrl', 'https://webhooks.athom.com/webhook/'+Homey.env.WEBHOOK_ID+'/?homey=' + homeyId);
			Homey.log('Registering webhook', Homey.env.WEBHOOK_ID, homeyId);
			// Register a webhook (as created on webhooks.athom.com)
			Homey.manager('cloud').registerWebhook(
				Homey.env.WEBHOOK_ID ,
				Homey.env.WEBHOOK_SECRET ,
				{ homey: homeyId } , 
				function onMessage(	args ,err ) {
					Homey.log('Webhook triggered. ', 'Err: ', err, 'Args: ', args);
					
					// Seems to be a delivery status update
					if(args && typeof(args.query) !== 'undefined' && typeof(args.query.status) !== 'undefined')
					{
						processStatusReport(args.query);
					}
					// Process received message (via POST)
					else if(args && typeof(args.body) !== 'undefined' && typeof(args.body.sender) !== 'undefined')
					{
						processMessage(args.body);
					}
					// Process received message (via GET)
					else if(args && typeof(args.query) !== 'undefined' && typeof(args.query.sender) !== 'undefined')
					{
						Homey.log('Received messaged via GET?');
						processMessage(args.query);
					}
					else
					{
						Homey.log('Unknown request received on webhook');
					}
					
				} ,
				function callback(err ,	success	) {
					Homey.log('Webhook registered?', homeyId, err, success);
				}
			)

		}
	)
	
	Homey.manager('flow').on('action.send_text', ( callback, args ) => {
		sendMessage((err, response) => callback(err, !err), {
			'recipients': [
				args.textRecipient
			],
			'body': args.textMessage,
			'type': 'sms',
		});
	});

	Homey.manager('flow').on('action.send_flash', ( callback, args ) => {
		sendMessage((err, response) => callback(err, !err), {
			'recipients': [
				args.flashRecipient
			],
			'body': args.flashMessage,
			'type': 'flash',
		});
	});
	
	Homey.manager('flow').on('action.send_voice', ( callback, args ) => {
		Homey.log('Sending voice message', args);

		sendMessage((err, response) => callback(err, !err), {
			'recipients': [
				args.voiceRecipient
			],
			'body': args.voiceMessage,
			'type': 'voice',
			'ifMachine': 'delay'
		});
	});

}

function sendMessage(callback, args) {
	Homey.log('Sending ' + args.type + ' message', args);
	
	var sender = Homey.manager('settings').get( 'messagebird.sender' );

	if (typeof(args.sender) != 'undefined') {
		sender = args.sender;
	}

	// Default to VMN number
	if(sender == '') {
		sender = 'inbox';
	}
	
	Object.assign(args, {
		'originator': sender,
		'datacoding': Homey.manager('settings').get( 'messagebird.translate' ) ? 'plain' : 'auto',
		'reference': 'Homey'
	})
	
	if(args.type == 'voice')
	{
		messagebird.voice_messages.create(args, messageCallback.bind(null, callback));
	}
	else
	{
		messagebird.messages.create(args, messageCallback.bind(null, callback));
	}
}

function messageCallback(callback, err, response) {
		console.log('Message send. Error:', err, 'Response:', response);
		
		if(err) {
			if(typeof(err.errors) !== 'undefined')
			{
				err = err.errors[0].description;
			}
			else if(typeof(err.code) !== 'undefined') {
				err = err.code;
			}
		}
		
		callback( err, response );

		if(!err) {
			// Voice object does not contain a 'type' property
			if(!response.type && response.voice)
			{
				response.type = 'voice';
			}
		
			var data = {
				sendRecipient: response.recipients.items.join(', '),
				sendMessage: response.body,
				sendType: response.type,
				sendId: response.id,
			};
		
			Homey.manager('flow').trigger ('message_send', data);
			Homey.manager('api' ).realtime('message_send', data)

			// Doesn't work in Node.js 4.x :(
			// var messagesFile = fs.openSync('/userdata/messages.json', 'w'); << Do not use 'w' here!
			var messagesFile = '/userdata/messages.json';
			storeMessage(messagesFile, response);
			// fs.closeSync(messagesFile);
		}
		
		getBalance();
		setTimeout(getBalance, 60000);
		setTimeout(getBalance, 120000);
	}

function processStatusReport(report) {
	// Doesn't work in Node.js 4.x :(
	// var messagesFile = fs.openSync('/userdata/messages.json', 'w');
	var messagesFile = '/userdata/messages.json';
	var message = getMessage(messagesFile, report.id);
	Homey.log('Recieved status report. Report:', report, 'Stored message:', JSON.stringify(message));

	if(typeof(message) !== 'undefined' && message)
	{
		var data = {
			reportRecipient: report.recipient,
			reportStatus: report.status,
			reportType: message.type
		}
		
		Homey.manager('flow').trigger ('message_report', data);
		Homey.manager('api' ).realtime('message_report', data);
		
		// Find recipient object
		var recipient = message.recipients.items.find((recipientObj) => {
			return recipientObj.recipient == report.recipient;
		});
		
		if(recipient)
		{
			if(!recipient.reports)
			{
				recipient.reports = [];
			}
			recipient.reports.push(report);
			recipient.status = report.status;
			
			// Might want to fetch this from the REST API if it prooves unreliable
			if(report.status in ['delivered', 'answered', 'machine'])
			{
				message.recipients.totalDeliveredCount++;
			}
			else if(report.status in ['expired', 'delivery_failed', 'failed'])
			{
				message.recipients.totalDeliveryFailedCount++;
			}
			
			// Get additional details from MessageBird online database
			messagebird.messages.read(report.id, function (err, response) {
				try {
					message.realOriginator = response.originator;
				} catch(err) {
					// Just ignore any errors Messagebird might throw and store message as-is
				}
				
				// Store modified message object
				// Should automagically replace the old object
				storeMessage(messagesFile, message);
			});
		}
		else
		{
			Homey.log('Error: Could not find recipient for this report');
		}
	}
	else
	{
		Homey.log('Error: Could not find stored message for this report');
	}
	
	// fs.closeSync(messagesFile);
}

function processMessage(report) {
	messagebird.messages.read(report.id, function (err, response) {
		response.vmn = report.receiver;
		
		storeMessage('/userdata/messages.json', response);
		
		var data = {
			messageRecipient: response.vmn,
			messageSender: response.originator,
			messageBody: response.body,
			messageType: response.type
		}
		
		Homey.manager('flow').trigger ('message_received', data);
		Homey.manager('api' ).realtime('message_received', data);
	});
}

function getBalance(callback) {
	var key = Homey.manager('settings').get( 'messagebird.apikey' );
	if(key && key.length > 10)
	{
		messagebird.balance.read((err, balance) => {
			if(!err && Homey.manager('settings').get( 'messagebird.balance' ) != balance.amount)
			{
				Homey.manager('settings').set( 'messagebird.balance', balance.amount )

				Homey.manager('insights').createEntry( 'messagebird_credit', balance.amount, new Date(), function(err, success){
					if( err ) return console.error(err);
				});
		
				Homey.manager('flow').trigger ('credits_changed', balance);
				Homey.manager('api' ).realtime('credits_changed', balance);
				
			}
			
			Homey.log('Balance: ', balance, err);
			if(typeof(callback) == 'function') {
				callback(err, balance);
			}
		})
	}
	else
	{
		if(typeof(callback) == 'function') {
			callback(true, null);
		}
	}
}

function storeMessage(file, messageObject) {
	var messages = getMessages(file);
	messages[messageObject.id] = messageObject;
	
	try {
		fs.writeFileSync( file, JSON.stringify( messages ), 'utf8' );
	} catch(err) {
		// Can't replicate the 'permission denied' error. Ignore for now...
	}
}

function getMessage(file, id) {
	var messages = getMessages(file);
	//Homey.log('Messages', messages);
	
	return messages[id];
}

function getMessages(file) {
	if(typeof(file) === 'undefined')
		file = '/userdata/messages.json';
	
	try {
		if(!fs.existsSync(file)) {
			fs.writeFileSync(file, '{}');
		}

		var messages = JSON.parse(fs.readFileSync(file, 'utf8'));
		return messages;
	} catch(err) {
		Homey.log('Error reading message db', err);
		return null;
	}
}

function purgeMessages(file) {
	if(typeof(file) === 'undefined')
		file = '/userdata/messages.json';
	
	var newName = file + '-' + process.hrtime()[0];
	
	try {
		var messages = fs.renameSync(file, newName);
		fs.writeFileSync(file, '{}');
		return newName;
	} catch(err) {
		Homey.log('Error purging message db', err);
		return null;
	}
}

module.exports.getMessages = getMessages;
module.exports.purgeMessages = purgeMessages;
module.exports.sendMessage = sendMessage;
module.exports.getBalance = getBalance;
module.exports.init = init;