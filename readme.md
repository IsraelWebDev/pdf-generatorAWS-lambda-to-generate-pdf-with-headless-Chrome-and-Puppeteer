# AWS lambda to generate pdf with headless Chrome and Puppeteer

Complete project allowing to deploy an API generating PDFs from html and css pages.


## Technologies used
* AWS Lambda with nodejs12.x runtime;
* Serverless CLI to deploy project;
* API Gateway to build an API with Lambda integration;
* SNS and serverless-plugin-aws-alerts to notify the developer team when there is an error in the code;
* Ajv to validate request parameters 
* S3 to store the returned pdf;
