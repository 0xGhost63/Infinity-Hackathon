SELECT current_database(), inet_server_addr();

SELECT COUNT(*) AS users FROM users;
SELECT COUNT(*) AS projects FROM projects;
SELECT COUNT(*) AS tasks FROM tasks;

ALTER TABLE users
ALTER COLUMN skills TYPE json
USING to_json(skills);
