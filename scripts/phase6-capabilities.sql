\set ON_ERROR_STOP on

INSERT INTO "Capability" (id, key, description, "createdAt") VALUES
  ('capability-insurance-manage', 'insurance.manage', 'Manage insurance configuration and availability.', CURRENT_TIMESTAMP),
  ('capability-driver-requirements-manage', 'driver-requirements.manage', 'Manage typed driver eligibility rules.', CURRENT_TIMESTAMP),
  ('capability-customer-fields-manage', 'customer-fields.manage', 'Manage supported customer and driver field modes.', CURRENT_TIMESTAMP),
  ('capability-booking-workflow-manage', 'booking-workflow.manage', 'Manage supported booking workflow step modes.', CURRENT_TIMESTAMP),
  ('capability-customer-sensitive-data-view', 'customer-sensitive-data.view', 'View sensitive customer and driver booking snapshots.', CURRENT_TIMESTAMP)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;
