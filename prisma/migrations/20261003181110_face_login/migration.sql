-- CreateTable
CREATE TABLE "face_profiles" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "descriptor" DOUBLE PRECISION[],
    "samples" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "face_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "face_login_attempts" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "distance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "face_login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "face_profiles_userId_key" ON "face_profiles"("userId");

-- CreateIndex
CREATE INDEX "face_login_attempts_userId_createdAt_idx" ON "face_login_attempts"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "face_profiles" ADD CONSTRAINT "face_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "face_login_attempts" ADD CONSTRAINT "face_login_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
