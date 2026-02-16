import { Sequelize, DataTypes } from "sequelize";
import fs from 'fs';

export const sequelize = new Sequelize(process.env.PGDATABASE, process.env.PGUSER, process.env.PGPASSWORD, {
    host: process.env.PGHOST,
    dialect: 'postgres',
    pool: {
        max: 50,
        min: 10,
        acquire: 30000,
        idle: 10000
    },
    dialectOptions: {
        ssl: {
            rejectUnauthorized: true,
            ca: fs.readFileSync('src/certificates/us-east-1-bundle.pem').toString()
        }
    }
});

export const users = sequelize.define('users', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
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
        defaultValue: Sequelize.literal('now()::timestamp')
    },
    disabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },
    first_login: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    verification_code: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "users" });

export const user_logs = sequelize.define('user_logs', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    log: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "user_logs" });

user_logs.belongsTo(users, { foreignKey: 'user_id', as: 'user' });

export const financing_sources = sequelize.define('financing_sources', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "financing_sources" });

export const projects = sequelize.define('projects', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    objectives: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    start_date: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    end_date: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    accomplishments: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: Sequelize.literal("'[]'")
    },
    project_status: {
        type: DataTypes.ENUM('ACTIVE', 'DELETED', 'ARCHIVED'),
        allowNull: false,
        defaultValue: 'ACTIVE',
    },
    project_category: {
        type: DataTypes.ENUM('PROJECT', 'AGREEMENT'),
        allowNull: false,
        defaultValue: 'PROJECT',
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    },
    assigned_agent_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        }
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "projects" });

projects.belongsTo(users, { foreignKey: 'assigned_agent_id', as: 'assigned_agent' });

export const project_financing_sources = sequelize.define('project_financing_sources', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    financing_source_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'financing_sources',
            key: 'id'
        }
    },
    project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'projects',
            key: 'id'
        }
    },
    amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "project_financing_sources" });

export const project_donations = sequelize.define('project_donations', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'projects',
            key: 'id'
        }
    },
    amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: ''
    },
    donation_type: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "project_donations" });

export const project_expenses = sequelize.define('project_expenses', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'projects',
            key: 'id'
        }
    },
    amount: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false,
        defaultValue: ''
    },
    expense_category_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
            model: 'expense_categories',
            key: 'id'
        }
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "project_expenses" });

export const expense_categories = sequelize.define('expense_categories', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true,
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "expense_categories" });

export const project_beneficiaries = sequelize.define('project_beneficiaries', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'projects',
            key: 'id'
        }
    },
    beneficiary_type: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    identifier: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    name: {
        type: DataTypes.TEXT
    },
    legal_name: {
        type: DataTypes.TEXT
    },
    gender: {
        type: DataTypes.TEXT
    },
    description: {
        type: DataTypes.TEXT
    },
    phone: {
        type: DataTypes.TEXT
    },
    email: {
        type: DataTypes.TEXT
    },
    address: {
        type: DataTypes.TEXT
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "project_beneficiaries" });

export const project_files = sequelize.define('project_files', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'projects',
            key: 'id'
        }
    },
    file: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "project_files" });

export const project_logs = sequelize.define('project_logs', {
    id: {
        type: DataTypes.UUID,
        primaryKey: true,
        allowNull: false,
        defaultValue: Sequelize.literal('gen_random_uuid()')
    },
    user_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        }
    },
    project_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
            model: 'projects',
            key: 'id'
        }
    },
    log: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    created_dt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('now()::timestamp')
    }
}, { freezeTableName: true, timestamps: false, schema: "caderh", tableName: "project_logs" });

// ─── SGC (Sistema de Gestión de Centros) ─────────────────────────────────────

export const sgc_areas = sequelize.define('areas', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.TEXT, allowNull: false },
    estatus: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
}, { schema: "centros", tableName: "areas", freezeTableName: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

export const sgc_departamentos = sequelize.define('departamentos', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.TEXT, allowNull: false },
    estatus: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
}, { schema: "centros", tableName: "departamentos", freezeTableName: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

export const sgc_municipios = sequelize.define('municipios', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.TEXT, allowNull: false },
    departamento_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: sgc_departamentos, key: 'id' } },
    geocodigo: { type: DataTypes.TEXT, allowNull: true },
    estatus: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 1 },
}, { schema: "centros", tableName: "municipios", freezeTableName: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

sgc_municipios.belongsTo(sgc_departamentos, { foreignKey: 'departamento_id', as: 'departamento' });

export const sgc_centros = sequelize.define('centros', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    siglas: { type: DataTypes.TEXT, allowNull: false },
    codigo: { type: DataTypes.TEXT, allowNull: false },
    nombre: { type: DataTypes.TEXT, allowNull: false },
    descripcion: { type: DataTypes.TEXT, allowNull: true },
    departamento_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: sgc_departamentos, key: 'id' } },
    municipio_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: sgc_municipios, key: 'id' } },
    logo: { type: DataTypes.TEXT, allowNull: true },
    foto: { type: DataTypes.TEXT, allowNull: true },
    direccion: { type: DataTypes.TEXT, allowNull: true },
    telefono: { type: DataTypes.TEXT, allowNull: true },
    email: { type: DataTypes.TEXT, allowNull: true },
    pagina_web: { type: DataTypes.TEXT, allowNull: true },
    facebook: { type: DataTypes.TEXT, allowNull: true },
    twitter: { type: DataTypes.TEXT, allowNull: true },
    nombre_director: { type: DataTypes.TEXT, allowNull: true },
    telefono_director: { type: DataTypes.TEXT, allowNull: true },
    email_director: { type: DataTypes.TEXT, allowNull: true },
    foto_director: { type: DataTypes.TEXT, allowNull: true },
    nombre_contacto: { type: DataTypes.TEXT, allowNull: true },
    telefono_contacto: { type: DataTypes.TEXT, allowNull: true },
    email_contacto: { type: DataTypes.TEXT, allowNull: true },
    puesto_contacto: { type: DataTypes.TEXT, allowNull: true },
    pie_reportes: { type: DataTypes.TEXT, allowNull: true },
    estatus: { type: DataTypes.SMALLINT, allowNull: false, defaultValue: 0 },
}, { schema: "centros", tableName: "centros", freezeTableName: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

sgc_centros.belongsTo(sgc_departamentos, { foreignKey: 'departamento_id', as: 'departamento' });
sgc_centros.belongsTo(sgc_municipios, { foreignKey: 'municipio_id', as: 'municipio' });