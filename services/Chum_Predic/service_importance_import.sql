BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS important_services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feature_name TEXT NOT NULL UNIQUE,
  imported_at_utc TEXT NOT NULL
);
DELETE FROM important_services;
INSERT INTO important_services (feature_name, imported_at_utc) VALUES ('DeviceProtection', '2026-03-28T21:13:15Z');
INSERT INTO important_services (feature_name, imported_at_utc) VALUES ('InternetService', '2026-03-28T21:13:15Z');
INSERT INTO important_services (feature_name, imported_at_utc) VALUES ('OnlineBackup', '2026-03-28T21:13:15Z');
INSERT INTO important_services (feature_name, imported_at_utc) VALUES ('OnlineSecurity', '2026-03-28T21:13:15Z');
INSERT INTO important_services (feature_name, imported_at_utc) VALUES ('StreamingMovies', '2026-03-28T21:13:15Z');
INSERT INTO important_services (feature_name, imported_at_utc) VALUES ('StreamingTV', '2026-03-28T21:13:15Z');
INSERT INTO important_services (feature_name, imported_at_utc) VALUES ('TechSupport', '2026-03-28T21:13:15Z');
COMMIT;
