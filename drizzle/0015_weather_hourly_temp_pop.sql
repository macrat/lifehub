CREATE TABLE "weather_pop" (
	"starts_at" timestamp with time zone PRIMARY KEY NOT NULL,
	"pop" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weather_hourly" ADD COLUMN "temp" integer;