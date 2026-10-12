// backend/lib/calendar-stack.ts
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "path";
import { resolveCalendarTable, resolveCreateTable } from "./baseId.cjs";

export interface CalendarConfig {
  id:            string;
  awsRegion:     string;
  userPoolId:    string;
  calendarTable?: string;
  /** Defaults to true. Set false after the first deploy of a table name. */
  createTable?:  boolean;
}

export interface CalendarStackProps extends cdk.StackProps {
  config:                CalendarConfig;
  calendarClientId?:     string;  // existing Cognito app client — preserved by deploy.sh
  calendarApiLogicalId?: string;  // existing API GW logical ID — prevents recreation
}

export class CalendarStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CalendarStackProps) {
    super(scope, id, props);

    const { calendarClientId, calendarApiLogicalId } = props;
    const config = {
      ...props.config,
      calendarTable: resolveCalendarTable(props.config.id, props.config.calendarTable),
      createTable: resolveCreateTable(props.config.createTable),
    };

    // ── Cognito — import existing User Pool ───────────────────────────────────
    const userPool = cognito.UserPool.fromUserPoolId(
      this, "UserPool", config.userPoolId
    );

    // ── Cognito App Client ────────────────────────────────────────────────────
    // Managed by deploy.sh — created once, never recreated.
    let appClientId: string;
    if (calendarClientId) {
      appClientId = calendarClientId;
    } else {
      const appClient = userPool.addClient("CalendarAppClient", {
        userPoolClientName: `${config.id}-calendar-client`,
        authFlows: {
          userPassword:      true,
          userSrp:           true,
          adminUserPassword: true,
        },
        preventUserExistenceErrors: true,
      });
      appClientId = appClient.userPoolClientId;
    }

    // ── DynamoDB ──────────────────────────────────────────────────────────────
    // createTable: true  → first deploy, table doesn't exist yet
    // createTable: false → table already exists, import only (never recreated)
    const tableArn = `arn:aws:dynamodb:${config.awsRegion}:${this.account}:table/${config.calendarTable}`;

    if (config.createTable) {
      const table = new dynamodb.Table(this, "CalendarTable", {
        tableName:     config.calendarTable,
        partitionKey:  { name: "userId",  type: dynamodb.AttributeType.STRING },
        sortKey:       { name: "sortKey", type: dynamodb.AttributeType.STRING },
        billingMode:   dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      table.addGlobalSecondaryIndex({
        indexName:      "gsi-startTime",
        partitionKey:   { name: "GSI_PK",    type: dynamodb.AttributeType.STRING },
        sortKey:        { name: "startTime", type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.ALL,
      });
    }

    // ── Lambda ────────────────────────────────────────────────────────────────
    const calendarLambda = new lambda.Function(this, "CalendarEvents", {
      runtime:     lambda.Runtime.NODEJS_20_X,
      handler:     "handler.handler",
      code:        lambda.Code.fromAsset(path.join(__dirname, "../lambda/calendarEvents")),
      environment: { CALENDAR_TABLE: config.calendarTable },
      timeout:     cdk.Duration.seconds(10),
    });

    // ── IAM — explicit policy covering table + GSI ────────────────────────────
    // Must use explicit ARNs — grantReadWriteData() on an imported table
    // does not cover GSI ARNs, causing AccessDeniedException on Query.
    calendarLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
      ],
      resources: [
        tableArn,
        `${tableArn}/index/*`,
      ],
    }));

    // ── API Gateway ───────────────────────────────────────────────────────────
    const api = new apigateway.RestApi(this, "CalendarApi", {
      restApiName: `${config.id}-calendar-api`,
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Authorization", "Content-Type"],
      },
    });

    if (calendarApiLogicalId) {
      const cfnApi = api.node.defaultChild as cdk.CfnResource;
      cfnApi.overrideLogicalId(calendarApiLogicalId);
    }

    // ── Cognito Authorizer ────────────────────────────────────────────────────
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this, "CalendarAuthorizer",
      { cognitoUserPools: [userPool] }
    );
    const authOptions: apigateway.MethodOptions = {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // ── Routes ────────────────────────────────────────────────────────────────
    const calendar = api.root.addResource("calendar");
    calendar.addMethod("GET",  new apigateway.LambdaIntegration(calendarLambda), authOptions);
    calendar.addMethod("POST", new apigateway.LambdaIntegration(calendarLambda), authOptions);
    const calendarItem = calendar.addResource("{id}");
    calendarItem.addMethod("PUT",    new apigateway.LambdaIntegration(calendarLambda), authOptions);
    calendarItem.addMethod("DELETE", new apigateway.LambdaIntegration(calendarLambda), authOptions);

    // ── Outputs ───────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "CalendarApiUrl",      { value: api.url });
    new cdk.CfnOutput(this, "CalendarApiId",       { value: api.restApiId });
    new cdk.CfnOutput(this, "CalendarUserPoolId",  { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "CalendarAppClientId", { value: appClientId });
    new cdk.CfnOutput(this, "CalendarTableName",   { value: config.calendarTable });
  }
}
