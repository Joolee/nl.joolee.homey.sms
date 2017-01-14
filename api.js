'use strict';

module.exports = [
  {
    description: 'Store MessageBird settings',
    method: 'PUT',
    path: '/messagebird/settings/sending/',
    fn: (callback, args) => {
		Homey.manager('settings').set( 'messagebird.apikey', args.body.apikey)
		Homey.manager('settings').set( 'messagebird.sender', args.body.sender)
		Homey.manager('settings').set( 'messagebird.translate', args.body.translate)
		Homey.log('New settings:', args.body);
		callback(null, null);
	}
  },
  {
    description: 'Fetch MessageBird credit balance',
    method: 'GET',
    path: '/messagebird/credits/',
    fn: Homey.app.getBalance
  },
  {
    description: 'Fetch MessageBird message log',
    method: 'GET',
    path: '/messagebird/messages/',
    fn: (callback, args) => callback(null, Homey.app.getMessages())
  },
  {
    description: 'Send message through MessageBird API',
    method: 'PUT',
    path: '/messagebird/sendmessage/',
    fn: (callback, args) => Homey.app.sendMessage(callback, args.body)
  },
  {
    description: 'Delete MessageBird message database',
    method: 'PUT',
    path: '/messagebird/purgedb/',
    fn: (callback, args) => callback(null, Homey.app.purgeMessages())
  }
];