import pg from 'pg';

const dbConfig = {
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
}

const db_ref = new pg.Pool(dbConfig);

const query = async (query, params = [], onlyFirst = false) => {
    const result = (await db_ref.query(query, params));
    if (result && result.rows && result.rows.length > 0) {
        if (onlyFirst) {
            return result.rows[0];
        } else {
            return result.rows;
        }
    } else {
        return null;
    }
}

export const db = {
    db_ref,
    query
}