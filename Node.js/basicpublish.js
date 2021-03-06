/**
 * Copyright 2019 IBM Corp.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/


// This is a demonstration showing the basic publish operations onto a MQ Topic
// Using the MQI Node.js interface

// This application is based on the samples
// https://github.com/ibm-messaging/mq-mqi-nodejs/blob/master/samples/amqsconn.js
// and
// https://github.com/ibm-messaging/mq-mqi-nodejs/blob/master/samples/amqspub.js
//
// Values for Queue Manager, Topic, Host, Port and Channel are
// passed in as envrionment variables.

// Import the MQ package
var mq = require('ibmmq');

// Load up missing envrionment variables from the .env settings file.
require('dotenv').load();

var MQC = mq.MQC; // Want to refer to this export directly for simplicity

// Set up debug logging options
var debug_info = require('debug')('amqspub:info');
var debug_warn = require('debug')('amqspub:warn');

var MQDetails = {
  QMGR: process.env.QMGR,
  TOPIC_NAME: process.env.TOPIC_NAME,
  HOST: process.env.HOST,
  PORT: process.env.PORT,
  CHANNEL: process.env.CHANNEL,
  KEY_REPOSITORY: process.env.KEY_REPOSITORY,
  CIPHER: process.env.CIPHER
}

var credentials = {
  USER: process.env.APP_USER,
  PASSWORD: process.env.APP_PASSWORD
}

function toHexString(byteArray) {
  return byteArray.reduce((output, elem) =>
    (output + ('0' + elem.toString(16)).slice(-2)),
    '');
}

// Define some functions that will be used from the main flow
function publishMessage(hObj) {

  var msgObject = {
    'Greeting': "Hello from Node at " + new Date()
  }
  var msg = JSON.stringify(msgObject);

  var mqmd = new mq.MQMD(); // Defaults are fine.
  var pmo = new mq.MQPMO();

  // Describe how the Publish (Put) should behave
  pmo.Options = MQC.MQPMO_NO_SYNCPOINT |
    MQC.MQPMO_NEW_MSG_ID |
    MQC.MQPMO_NEW_CORREL_ID;
  // Add in the flag that gives a warning if noone is
  // subscribed to this topic.
  pmo.Options |= MQC.MQPMO_WARN_IF_NO_SUBS_MATCHED;
  mq.Put(hObj, mqmd, pmo, msg, function(err) {
    if (err && 'object' === typeof err && err.mqrc &&
      MQC.MQRC_NO_SUBS_MATCHED == err.mqrc && err.mqrcstr) {
      debug_info('Publish unsuccessful because there are no subscribers', err.mqrcstr);
    } else if (err) {
      debug_warn('Error Detected in Put operation', err);
    } else {
      debug_info('MsgId: ', toHexString(mqmd.MsgId));
      debug_info("MQPUT for Publish successful");
    }
  });
}

// amqspub:warn Error Detected in Put operation { MQError: PUT: MQCC = MQCC_WARNING [1] MQRC = MQRC_NO_SUBS_MATCHED [2550]



// When we're done, close topics and connections
function cleanup(hConn, hObj) {
  mq.Close(hObj, 0, function(err) {
    if (err) {
      debug_warn('Error Detected in Close operation', err);
    } else {
      debug_info("MQCLOSE successful");
    }
    mq.Disc(hConn, function(err) {
      if (err) {
        debug_warn('Error Detected in Disconnect operation', err);
      } else {
        debug_info("MQDISC successful");
      }
    });
  });
}

// The program really starts here.
// Connect to the queue manager. If that works, the callback function
// opens the topic, and then we can put a message.

debug_info('Starting up Application');

var cno = new mq.MQCNO();
// cno.Options = MQC.MQCNO_NONE;
// use MQCNO_CLIENT_BINDING to connect as client
cno.Options = MQC.MQCNO_CLIENT_BINDING;

// To add authentication, enable this block
if (credentials.USER) {
  var csp = new mq.MQCSP();
  csp.UserId = credentials.USER;
  csp.Password = credentials.PASSWORD;
  cno.SecurityParms = csp;
}

// And then fill in relevant fields for the MQCD
var cd = new mq.MQCD();
cd.ConnectionName = `${MQDetails.HOST}(${MQDetails.PORT})`;
cd.ChannelName = MQDetails.CHANNEL;

if (MQDetails.KEY_REPOSITORY) {
  debug_info('Will be running in TLS Mode');
  // *** For TLS ***
  var sco = new mq.MQSCO();

  cd.SSLCipherSpec = MQDetails.CIPHER;
  cd.SSLClientAuth = MQC.MQSCA_OPTIONAL;

  sco.KeyRepository = MQDetails.KEY_REPOSITORY;
  // And make the CNO refer to the SSL Connection Options
  cno.SSLConfig = sco;
}

// Make the MQCNO refer to the MQCD
cno.ClientConn = cd;

debug_info('Attempting Connection to MQ Server');
mq.Connx(MQDetails.QMGR, cno, function(err, hConn) {
  if (err) {
    debug_warn('Error Detected making Connection', err);
  } else {
    debug_info("MQCONN to %s successful ", MQDetails.QMGR);

    // Define what we want to open, and how we want to open it.
    //
    // For this sample, we use only the ObjectString, though it is possible
    // to use the ObjectName to refer to a topic Object (ie something
    // that shows up in the DISPLAY TOPIC list) and then that
    // object's TopicStr attribute is used as a prefix to the TopicString
    // value supplied here.
    // Remember that the combined TopicString attribute has to match what
    // the subscriber is using.
    var od = new mq.MQOD();
    od.ObjectString = MQDetails.TOPIC_NAME;
    od.ObjectType = MQC.MQOT_TOPIC;
    var openOptions = MQC.MQOO_OUTPUT;
    mq.Open(hConn, od, openOptions, function(err, hObj) {
      if (err) {
        debug_warn('Error Detected Opening MQ Connection', err);
      } else {
        debug_info("MQOPEN of %s successful", MQDetails.QUEUE_NAME);
        publishMessage(hObj);
      }
      cleanup(hConn, hObj);
    });
  }
});
