DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'User'
  ) THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accessCode" TEXT;

    UPDATE "User"
    SET "accessCode" = CONCAT(
      'ACC-',
      SUBSTRING("role"::text FROM 1 FOR 3),
      '-',
      UPPER(SUBSTRING(MD5("id") FROM 1 FOR 6))
    )
    WHERE "accessCode" IS NULL OR "accessCode" = '';

    ALTER TABLE "User" ALTER COLUMN "accessCode" SET NOT NULL;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND indexname = 'User_accessCode_key'
    ) THEN
      CREATE UNIQUE INDEX "User_accessCode_key" ON "User"("accessCode");
    END IF;
  END IF;
END $$;