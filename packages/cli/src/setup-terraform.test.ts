import { describe, expect, it } from "vitest";
import { renderTerraformTfvars } from "./setup-terraform";

describe("renderTerraformTfvars", () => {
  it("renders Terraform interpolation syntax as literal text", () => {
    const expressionMarker = "$";
    const tfvars = renderTerraformTfvars({
      appName: `app-${expressionMarker}{file("/tmp/name")}`,
      environment: "%{if true}prod%{endif}",
      region: "us-east-1",
      baseUrl: "",
      domainName: "",
      route53ZoneId: "",
      acmCertificateArn: "",
      rdsInstanceClass: "db.t3.micro",
      enableRedis: false,
      redisInstanceClass: "cache.t4g.micro",
      googleClientId: "google-$id",
      googleClientSecret: "google-secret",
      googlePubsubTopicName: "projects/demo/topics/inbox-zero",
      defaultLlmProvider: "openai",
      defaultLlmModel: "model-100%",
    });

    expect(tfvars).toContain('app_name = "app-$${file(\\"/tmp/name\\")}"');
    expect(tfvars).toContain('environment = "%%{if true}prod%%{endif}"');
    expect(tfvars).toContain('google_client_id = "google-$id"');
    expect(tfvars).toContain('default_llm_model = "model-100%"');
  });
});
