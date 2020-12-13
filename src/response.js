'use strict';
const aws = require('aws-sdk');
const sns = new aws.SNS();

let __awsCallback = null;
let __awsContext = null;

let setContext = (awsCallback, awsContext) => {
  __awsCallback = awsCallback;
  __awsContext = awsContext;
};

const sendSnsNotification = (messageBody, title, callback) => {
  if (!__awsContext) {
    callback(
      'Undefined aws context : make sure you have ' +
      'initialized the response with setContext function.'
    );
  } else if (!messageBody) {
    callback('Undefined messageBody.');
  } else if (!process.env.ALERT_NOTIFICATIONS_SNS_ARN) {
    callback(
      'Undefined ALERT_NOTIFICATIONS_SNS_ARN ' +
      'environment variable.'
    );
  } else {
    let contextMessage = '';
    try {
      contextMessage =
        'Remaining time : ' + __awsContext.getRemainingTimeInMillis() + '\n' +
        'Function name : ' + __awsContext.functionName + '\n' +
        'AWSrequestID:' + __awsContext.awsRequestId + '\n' +
        'Log group name : ' + __awsContext.logGroupName + '\n' +
        'Log stream name : ' + __awsContext.logStreamName + '\n';
    } catch (e) {
      contextMessage = 'Error : can\'t fetch the aws context.';
    }

    let snsMessage =
      'This is a back end notification message.\n' +
      '\n-------AWS CONTEXT :----\n' +
      contextMessage +
      '\n-------MESSAGE :---------\n' +
      messageBody;


    sns.publish({
      Message: snsMessage,
      Subject: title,
      TopicArn: process.env.ALERT_NOTIFICATIONS_SNS_ARN,
    }, (err, data) => {
      callback(err, data);
    });
  }
};

const successResponse = (body) => buildResponse(200, body);

const badRequestResponse = (body) => buildResponse(400, body);

const internalErrorResponse = (body) => buildResponse(500, body);

const buildResponse = (statusCode, body) => ({
  statusCode: statusCode,
  headers: {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  },
  body: JSON.stringify(body)
});

const errorMapping = (error) => {
  if (error instanceof Error) {
    error = {
      code: "internal",
      message: error.message,
      stack: error.stack
    }
  }

  if (
    typeof error === 'object' &&
    error.hasOwnProperty('code') &&
    error.hasOwnProperty('message') &&
    error.hasOwnProperty('stack')
  ) {
    
    console.error('Error : ', error);
    
    let response = null;
    switch (error.code) {
      case 'invalidParameter':
        response = badRequestResponse(error.message);
        break;
      case 'internal':
        response = internalErrorResponse(error.message);
        break;
      default:
        response = internalErrorResponse(error.message);
    }
    if (response.statusCode >= 500 && response.statusCode < 600) {
      sendSnsNotification(
        JSON.stringify(error),
        'Api error',
        (err, data) => {
          if (err) {
            console.error(
              '<!>Warning : sns related error, ' +
              'no email notification posted to report this error.<!>'
            );
            console.error(err);
          } else {
            console.log(
              'A notification message was posted ' +
              'to notify the developeurrs of the occured api error.'
            );
          }
        }
      );
    }
    __awsCallback(null, response);
  } else {
    throw new Error('The error must be instance of Error or type of object and contains code, message and stack properties.');
  }
}

const send = (error, success) => {
  try {
    if (!__awsCallback) {
      throw new Error(
        'Undefined aws callback : make sure you have ' +
        'initialized the response with setContext function.'
      );
    } else if (!__awsContext) {
      throw new Error(
        'Undefined aws context : make sure you have ' +
        'initialized the response with setContext function.'
      );
    } else if (error) {
      errorMapping(error);
    } else if (success) {
      console.log('Success : ', success);
      __awsCallback(null, successResponse(success));
    } else {
      throw new Error('You must to define error or success parameters.');
    }
  } catch (error) {
    errorMapping(error);
  }
}

module.exports = {
  setContext: setContext,
  send: send
};