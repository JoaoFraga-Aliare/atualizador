-- O payload do envio vai ao ERP exatamente como o terminal mandou (ordem das chaves incluida):
-- jsonb reordena as chaves, json guarda o texto original.
alter table outbox alter column payload type json using payload::text::json;
