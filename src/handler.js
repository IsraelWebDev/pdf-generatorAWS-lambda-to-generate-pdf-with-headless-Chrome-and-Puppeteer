'use strict';

const response = require(__dirname + '/response.js');
const aws = require('aws-sdk');
const Ajv = require('ajv');
const chromium = require("chrome-aws-lambda");

let browser = null;

exports.main = async (event, context, callback) => {
  response.setContext(callback, context);
  context.callbackWaitsForEmptyEventLoop = false;
  await getParameters(event)
    .then(generatePdf)
    .then(putPdfToS3Bucket)
    .then(async data => {
      console.log();
      console.log('Function: successCallback');
      console.log('Parameters : ', data);
      response.send(null, data);
    })
    .catch(err => {
      console.log();
      console.log('Function: failureCallback');
      console.log('Parameters : ', err);
      response.send(err);
    })
    .finally(async () => {
      console.log();
      console.log('Function: finalyCallback');
      if (browser !== null) {
        await browser.close();
      }
    });
}

let getParameters = async (event) => {
  console.log();
  console.log('Function: getParameters');
  console.log('Parameters : ', event.body);
  var ajv = new Ajv({
    useDefaults: true
  });
  let body = null;
  try {
    body = (event.body);
  } catch (err) {
    throw {
      code: "invalidParameter",
      message: err.message,
      stack: err.stack
    };
  }

  var validate = ajv.compile(schema);
  var valid = validate(body);
  if (!valid) {
    throw {
      code: "invalidParameter",
      message: {
        errors: JSON.stringify(validate.errors),
        schema: schema
      },
      stack: new Error().stack
    };
  }

  return body;
}

let generatePdf = async (data) => {
  console.log();
  console.log('Function: generatePdf');
  console.log('Parameters : ', data);
  const defaultViewport = data.defaultViewport;
  browser = await chromium.puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
    dumpio: true,
    defaultViewport
  });

  const page = await browser.newPage();
  await page.setDefaultNavigationTimeout(0);
  
  if (data.hasOwnProperty('cookies')) {
    await page.setCookie(...data.cookies);
  }
  if (data.hasOwnProperty('url')) {
    await page.goto(data.url, {
      waitUntil: ['networkidle0', 'load', 'domcontentloaded']
    });
  } else {
    await page.setContent(data.html, {
      waitUntil: ['networkidle0', 'load', 'domcontentloaded']
    });
  }
  //await page.emulateMedia("screen");
  let pdf = null;
  try {
    pdf = data.output=='PDF' ? await page.pdf(data.options) : await page.content();
  } catch (err) {
    throw {
      code: "invalidParameter",
      message: err.message,
      stack: err.stack
    };
  }
  
  return {
    key: data.fileName,
    s3Bucket: data.s3Bucket,
    pdf: pdf,
    output: data.output
  };
}

let putPdfToS3Bucket = async (data) => {
  console.log();
  console.log('Function: putPdfToS3Bucket');
  console.log('Parameters (key): ', data.key);
  console.log('Parameters (s3Bucket): ', data.s3Bucket);
  const s3 = new aws.S3({
    region: data.s3Bucket.region,
    /*credentials: {
      accessKeyId: data.s3Bucket.credentials.awsAccessKeyId,
      secretAccessKey: data.s3Bucket.credentials.awsSecretAccessKey
    }*/
  });

  try {
    await s3.putObject({
      Bucket: data.s3Bucket.name,
      Key: data.key,
      Body: data.pdf,
      ContentType: data.output!='HTML' ? "application/pdf" : "text/html",
    }).promise();
  } catch (err) {
    throw {
      code: "invalidParameter",
      message: err.message,
      stack: err.stack
    };
  }

  return {
    url: `https://${ data.s3Bucket.name }.s3.${ data.s3Bucket.region }.amazonaws.com/${ data.key }`
  };
}

const schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Request body",
  "description": "<json object> Config to generate pdf.",
  "type": "object",
  "properties": {
    "fileName": {
      "title": "fileName",
      "description": "<string> The file name of the pdf.",
      "type": "string",
      "pattern": "^.+\\.\(pdf|html\)$"
    },
    "url": {
      "title": "url",
      "description": "<string> The url to convert in pdf.",
      "type": "string",
    },
    "html": {
      "title": "html",
      "description": "<string> The html to convert in pdf.",
      "type": "string",
    },
    "cookies":{
      "title": "cookies",
      "description":"<array> The cookies to send to Chromium.",
      "type":"array",
      "items":{
        "type":"object",
        "properties":{
          "name":{
            "type":"string"
          },
          "value":{
            "type":"string"
          },
          "domain":{
            "type":"string"
          },
          "url":{
            "type":"string"
          }
        }
      }
    },
    "output": {
      "title": "output",
      "description": "<string> Optionally set return type to HTML",
      "type": "string",
      "default": "PDF"
    },
    "s3Bucket": {
      "title": "s3Bucket",
      "description": "<Object> Configuration to access and upload pdf in s3 bucket.",
      "type": "object",
      "properties": {
        "name": {
          "title": "name",
          "description": "<string> name of the s3 bucket.",
          "type": "string",
        },
        "region": {
          "title": "region",
          "description": "<string> The region of the s3 bucket.",
          "type": "string",
          "default": "eu-west-3"
        },
        "credentials": {
          "title": "credentials",
          "description": "<object> Credentials to access s3 bucket.",
          "type": "object",
          "properties": {
            "awsAccessKeyId": {
              "title": "awsAccessKeyId",
              "description": "<string> Aws access key id to access s3 bucket.",
              "type": "string",
            },
            "awsSecretAccessKey": {
              "title": "awsSecretAccessKey",
              "description": "<string> Aws secret access key to access the s3 bucket.",
              "type": "string"
            }
          },
          "default": {},
          "required": []
        }
      },
      "default": {},
      "required": ["name"]
    },
    "defaultViewport": {
      "title": "defaultViewport",
      "description": "<Object> Sets a consistent viewport for the browser page. Defaults to an 800x600.",
      "type": "object",
      "properties": {
        "width": {
          "title": "width",
          "description": "<number> page width in pixels.",
          "type": "number",
          "default": 1440
        },
        "height": {
          "title": "height",
          "description": "<number> page height in pixels.",
          "type": "number",
          "default": 1080
        }
      },
      "default": {}
    },
    "options": {
      "title": "options",
      "description": "<Object> Options object to generate pdf.",
      "type": "object",
      "properties": {
        "displayHeaderFooter": {
          "title": "displayHeaderFooter",
          "description": "<boolean> Display header and footer. Defaults to false.",
          "type": "boolean",
          "default": false
        },
        "headerTemplate": {
          "title": "headerTemplate",
          "description": "<string> HTML template for the print header. Should be valid HTML markup with following classes used to inject printing values into them: \n- date formatted print date \n- title document title \n- url document location \n- pageNumber current page number \n- totalPages total pages in the document",
          "type": "string"
        },
        "footerTemplate": {
          "title": "footerTemplate",
          "description": "<string> HTML template for the print footer. Should use the same format as the headerTemplate.",
          "type": "string"
        },
        "printBackground": {
          "title": "printBackground",
          "description": "<boolean> Print background graphics. Defaults to true.",
          "type": "boolean",
          "default": true
        },
        "landscape": {
          "title": "landscape",
          "description": "<boolean> Paper orientation. Defaults to false.",
          "type": "boolean",
          "default": false
        },
        "pageRanges": {
          "title": "pageRanges",
          "description": "<string> Paper ranges to print, e.g., '1-5, 8, 11-13'. Defaults to the empty string, which means print all pages.",
          "type": "string",
          "default": ""
        },
        "format": {
          "title": "format",
          "description": "<string> Paper format. If set, takes priority over width or height options. Defaults to 'Letter'.",
          "type": "string",
          "default": "Letter"
        },
        "width": {
          "title": "width",
          "description": "<number> Paper width, accepts values labeled with units.",
          "type": "number"
        },
        "height": {
          "title": "height",
          "description": "<number> Paper height, accepts values labeled with units.",
          "type": "number"
        },
        "margin": {
          "title": "margin",
          "description": "<Object> Paper margins, defaults to none.",
          "type": "object",
          "properties": {
            "top": {
              "title": "top",
              "description": "<string> Top margin, accepts values labeled with units.",
              "type": "string"
            },
            "right": {
              "title": "right",
              "description": "<string|number> Right margin, accepts values labeled with units.",
              "type": "string"
            },
            "bottom": {
              "title": "bottom",
              "description": "<string> Bottom margin, accepts values labeled with units.",
              "type": "string"
            },
            "left": {
              "title": "left",
              "description": "<string> Left margin, accepts values labeled with units.",
              "type": "string"
            }
          }
        },
        "preferCSSPageSize": {
          "title": "preferCSSPageSize",
          "description": "<boolean> Give any CSS @page size declared in the page priority over what is declared in width and height or format options. Defaults to false, which will scale the content to fit the paper size.",
          "type": "boolean",
          "default": false
        }
      },
      "default": {}
    }
  },
  "if": {
    "properties": {
      "url": {
        "const": ""
      }
    }
  },
  "then": {
    "required": ["html"]
  },
  "else": {
    "properties": {
      url: {
        "format": "uri"
      }
    }
  },
  "if": {
    "properties": {
      "url": {
        "const": ""
      }
    }
  },
  "then": {
    "required": ["html"]
  },
  "required": ["fileName"]
};


