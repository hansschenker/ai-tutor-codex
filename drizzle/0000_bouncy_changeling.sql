CREATE TABLE "app_state" (
	"key" varchar(80) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" varchar(120) PRIMARY KEY NOT NULL,
	"lesson_id" varchar(120),
	"asked_by" varchar(160) NOT NULL,
	"role" varchar(40) NOT NULL,
	"prompt" text NOT NULL,
	"answer" text NOT NULL,
	"source" varchar(40) NOT NULL,
	"audience" varchar(80) NOT NULL,
	"estimated_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
