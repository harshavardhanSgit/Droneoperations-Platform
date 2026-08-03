-- A rating outside 1..5 is meaningless. class-validator already rejects it at
-- the edge, but the database is the last line: a seed script, a migration or a
-- future endpoint that skips the DTO must not be able to write nonsense.
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

-- Money is never negative. Same reasoning.
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive" CHECK ("amount_minor" > 0);
