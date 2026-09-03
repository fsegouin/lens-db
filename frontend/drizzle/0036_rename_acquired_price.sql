-- What an owner paid is recorded in their own currency, so calling the column
-- acquired_price_usd invites someone to sum euros as dollars. The currency it
-- is in lives on the owner, in users.kit_currency.

ALTER TABLE kit_items RENAME COLUMN acquired_price_usd TO acquired_price;
