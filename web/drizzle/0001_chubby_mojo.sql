CREATE TYPE "public"."task_status" AS ENUM('open', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_kind" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."verification_job_status" AS ENUM('pending', 'running', 'verified', 'rejected', 'failed', 'exceeded_budget');--> statement-breakpoint
CREATE TABLE "activity_event" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"conjecture_id" text,
	"user_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_challenge" (
	"challenge" text PRIMARY KEY NOT NULL,
	"agent_name" text NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_token" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_token_agent_name_unique" UNIQUE("agent_name"),
	CONSTRAINT "agent_token_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "claim_proposal" (
	"id" serial PRIMARY KEY NOT NULL,
	"conjecture_id" text NOT NULL,
	"user_id" text NOT NULL,
	"claim_type" text NOT NULL,
	"scope" text,
	"source_url" text NOT NULL,
	"source_title" text,
	"source_quote" text,
	"notes" text,
	"status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"github_pr_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proof_proposal" (
	"id" serial PRIMARY KEY NOT NULL,
	"conjecture_id" text NOT NULL,
	"user_id" text NOT NULL,
	"lean_body" text NOT NULL,
	"status" "moderation_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"github_pr_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" serial PRIMARY KEY NOT NULL,
	"conjecture_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_job" (
	"id" serial PRIMARY KEY NOT NULL,
	"proof_proposal_id" integer NOT NULL,
	"workflow_run_id" text,
	"status" "verification_job_status" DEFAULT 'pending' NOT NULL,
	"outcome" text,
	"elapsed_seconds" integer,
	"log_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "parent_comment_id" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "kind" "user_kind" DEFAULT 'human' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity_event" ADD CONSTRAINT "activity_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_token" ADD CONSTRAINT "agent_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_proposal" ADD CONSTRAINT "claim_proposal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claim_proposal" ADD CONSTRAINT "claim_proposal_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_proposal" ADD CONSTRAINT "proof_proposal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_proposal" ADD CONSTRAINT "proof_proposal_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_job" ADD CONSTRAINT "verification_job_proof_proposal_id_proof_proposal_id_fk" FOREIGN KEY ("proof_proposal_id") REFERENCES "public"."proof_proposal"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_event_created_idx" ON "activity_event" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "claim_proposal_status_idx" ON "claim_proposal" USING btree ("status");--> statement-breakpoint
CREATE INDEX "claim_proposal_conjecture_idx" ON "claim_proposal" USING btree ("conjecture_id");--> statement-breakpoint
CREATE INDEX "proof_proposal_status_idx" ON "proof_proposal" USING btree ("status");--> statement-breakpoint
CREATE INDEX "proof_proposal_conjecture_idx" ON "proof_proposal" USING btree ("conjecture_id");--> statement-breakpoint
CREATE INDEX "task_conjecture_idx" ON "task" USING btree ("conjecture_id","status");--> statement-breakpoint
CREATE INDEX "verification_job_proposal_idx" ON "verification_job" USING btree ("proof_proposal_id");--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_parent_comment_id_comment_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comment"("id") ON DELETE set null ON UPDATE no action;