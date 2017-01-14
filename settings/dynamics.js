function onHomeyReady(){
	Homey.get( function(err, settings) {
		console.log('Settings: ', settings);
		$('#apikey').val(settings['messagebird.apikey']);
		$('#sender').val(settings['messagebird.sender']);
		$('input[name="translate"]').val([settings['messagebird.translate'] ? 'on' : 'off']);
		
		setupUrlCopier(settings['webhookUrl']);
		
		Homey.ready()
	} );
	
	Homey.on( 'message_send', function( data ){
		getMessages();
		getCredits();
	});
	Homey.on( 'message_received', function( data ){
		getMessages();
	});
	Homey.on( 'message_report', function( data ){
		getMessages();
	});
	Homey.on( 'credits_changed', function( data ){
		getCredits();
	});

	getCredits();
	getMessages();
	
	$('.info-button a').on('click', function() {
		$(this).parent().next('div').slideToggle();
		$(this).next().addClass('animate').toggleClass('fa-rotate-90');
		return false;
	})
	
	$('.done').on('click', function() {
		$(this).parent().prev('h3').children('a').trigger('click');
		return false;
	})
}

function setupUrlCopier(url) {
	$('.webhookUrl').val(url);
	$('.webhookUrlCopy').each(function() {
		new Clipboard(this);
	});
}

function clearLogs() {
	if(confirm(__('settings.logs.confirmclear'))) {
		Homey.api( 'PUT', '/messagebird/purgedb/',
		function( err, response ){
			if( err ) return console.error( err );
			$('#logs table tbody').empty();
			$('#vmn-matches table tbody').empty();
			$('#vmn-matches-zero').show();
			$('#vmn-matches').hide();
			vmnmatches = {};
		});
	}
}

function getMessages() {
	$('#logs').addClass('loading');
	
	Homey.api( 'GET', '/messagebird/messages/', function( err, response ){
		$('#logs table tbody').empty();
		$('#vmn-matches table tbody').empty();
		vmnmatches = {};
		$('#logs').removeClass('loading');
		console.log('Messages: ', response);
		
		if(response) {
			Object.keys(response).reverse().forEach(function(index) {
				var record = response[index];
				addLogRecord(record);
				getVMN(record);
			});
		}
	});
}
var vmnmatches = {};

function getVMN(record) {
	if(record.originator == 'inbox' && record.realOriginator && record.direction == 'mt') {
		$.each(record.recipients.items, function(index, recipient) {
			console.log('vmnrecipient', recipient);
			if(!vmnmatches[recipient.recipient])
			{
				$('#vmn-matches-zero').hide();
				$('#vmn-matches').show();
				
				vmnmatches[recipient.recipient] = [record.realOriginator];
				var tbody = $('#vmn-matches table tbody');
				var row = $('<tr>').attr('id', 'vmn-match-' + recipient.recipient);
				row.append($('<td>').addClass('vmn-sender').html(recipient.recipient));
				row.append($('<td>').addClass('vmn-vmns').html(record.realOriginator));
				tbody.append(row);
			}
			else if(vmnmatches[recipient.recipient].indexOf(record.realOriginator) === -1) {
				vmnmatches[recipient.recipient].push(record.realOriginator);
				var row = $('#vmn-match-' + recipient.recipient);
				row.children('.vmn-vmns').append('<br>' + record.realOriginator);
			}
		});
	}
}

function addLogRecord(record) {
	var tbody = $('#logs table tbody');
	var row = $('<tr>');

	var icon = record.direction == 'mt' ? 'right' : 'left';
	var title = __('settings.logs.' + (record.direction == 'mt' ? 'send' : 'received'));
	row.append($('<td>').addClass('log-direction').html('<i class="fa fa-arrow-' + icon + '" title="'+title+'"><span class="sr-only">'+title+'</span></i>'));
	
	if(record.type == 'voice')	icon = 'volume-control-phone';
	else if(record.type == 'flash')	icon = 'flash';
	else 							icon = 'envelope-o';
	row.append($('<td>').addClass('log-type')     .html('<i class="fa fa-' + icon + '" title="'+__(record.type)+'"><span class="sr-only">'+__(record.type)+'</span></i>'));

	row.append($('<td>').addClass('log-date')     .text(displayDate(record.createdDatetime)));
	row.append($('<td>').addClass('log-status')   .text(ucFirst(record.recipients.items[0].status)));
	row.append($('<td>').addClass('log-sender')   .text(record.originator.toString().replace(/^(31|32|44|49)/, '0')));
	row.append($('<td>').addClass('log-recipient').text(record.recipients.items[0].recipient.toString().replace(/^(31|32|44|49)/, '0')));
	row.append($('<td>').addClass('log-message')  .html('<attr title="' + record.body + '">' + record.body + '</attr>'));
	tbody.append(row);
}

function displayDate(dateString) {
	var date = new Date(dateString);
	function pad(n){return n<10 ? '0'+n : n}
	
	return date.toISOString().slice(0,10) + ' ' + date.toISOString().slice(11,19);
}

function saveSending() {
	Homey.api( 'PUT', '/messagebird/settings/sending/', {
			apikey: $('#apikey').val(),
			sender: $('#sender').val(),
			translate: $('input[name="translate"]:checked').val() == 'on',
		},
		function( err, response ){
			if( err ) return console.error( err );
			$('.sendingForm .success').show().fadeOut(4000);
			getCredits();
		}
	);
}

function sendMessageVMN() {
	var args = {
		type: 'sms',
		body: $('#vmn-message').val(),
		recipients: [
			$('#vmn-recipient').val()
		],
		sender: $('#vmn-sender').val(),
	}
	
	Homey.api( 'PUT', '/messagebird/sendmessage/', args,
		function( err, response ){
			console.log(response);
			if( err ) return alert( err );
			$('.sendmsg .success').show().fadeOut(4000);
			getCredits();
		}
	);
}

function ucFirst(string) {
	return String(string).charAt(0).toUpperCase() + String(string).slice(1);
}

function getCredits() {
	Homey.api( 'GET', '/messagebird/credits/', function( err, response ){
		console.log( 'Credits: ', response );
		
		if(!err && response)
		{
			response.type = ucFirst(response.type);
			response.payment = ucFirst(response.payment);
			$('#creditbalance').html(response.amount + " " + response.type);
			$('#creditpayment').html(response.payment);
			$('#accountWarning').hide();
			$('#creditsinfo').show();
		}
		else
		{
			$('#accountWarning').show();
			$('#creditsinfo').hide();
		}
	});
}
