/*
  Warnings:

  - A unique constraint covering the columns `[key]` on the table `Framework` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Framework_key_key" ON "Framework"("key");
