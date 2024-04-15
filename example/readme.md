## Example app for Fastify-DynamoDM

Quickstart: in this directory run:
```sh
npm ci
node server.mjs
```

By default this will attempt to use the AWS credentials in your environment to create and access a DynamoDB table called "my-app-table", so you must have [configured credentials](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) for AWS first.

Alternatively, you can run [dynamodb-local](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html), and then run to use the local dynamodb instance on port 8000.
```
node server.mjs --local-db
```


The example app can then be accessed at <http://localhost:8080/>
