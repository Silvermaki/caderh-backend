import { Sequelize, DataTypes } from "sequelize";

export const sequelize = new Sequelize(process.env.PGDATABASE, process.env.PGUSER, process.env.PGPASSWORD, {
    host: process.env.PGHOST,
    dialect: 'postgres',
    pool: {
        max: 50,
        min: 10,
        acquire: 30000,
        idle: 10000
    }
});

export const users = sequelize.define('users', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
    },
    email: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    password: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    role: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    disabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
    },
    first_login: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
    },
    verification_code: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "users" });