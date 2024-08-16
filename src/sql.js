const sqlUsers = `
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        user_id NUMBER,
        role TEXT,
        requests TEXT
    )
`;

const sqlPhotos = `
    CREATE TABLE IF NOT EXISTS photos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        request_number NUMBER,
        media TEXT
    )
`;
const sqlMessages = `
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        request_number INTEGER,
        text TEXT
    )
`;

module.exports = { sqlUsers, sqlPhotos, sqlMessages };
