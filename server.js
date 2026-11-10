const path = require('path');
const fs = require('fs');
const os = require('os');
const express = require('express');
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'inventory_db',
};

function validateProduct(body = {}) {
  const product_name = String(body.product_name ?? '').trim();
  const category = String(body.category ?? '').trim();
  const managed_by = String(body.managed_by ?? '').trim();
  const rawStock = body.stock_quantity;
  const rawPrice = body.unit_price;

  if (!product_name || product_name.length > 100) {
    return { error: 'Product name is required (max 100 characters).' };
  }
  if (!category || category.length > 50) {
    return { error: 'Category is required (max 50 characters).' };
  }
  if (!managed_by || managed_by.length > 60) {
    return { error: 'Manager name is required (max 60 characters).' };
  }
  if (rawStock === '' || rawStock === null || rawStock === undefined) {
    return { error: 'Stock quantity is required.' };
  }
  const stock_quantity = Number(rawStock);
  if (!Number.isInteger(stock_quantity) || stock_quantity < 0) {
    return { error: 'Stock quantity must be a non-negative whole number.' };
  }
  if (rawPrice === '' || rawPrice === null || rawPrice === undefined) {
    return { error: 'Unit price is required.' };
  }
  const parsedPrice = Number(rawPrice);
  if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
    return { error: 'Unit price must be 0.00 or higher.' };
  }
  const unit_price = Number(parsedPrice.toFixed(2));

  return { value: { product_name, category, stock_quantity, unit_price, managed_by } };
}

function buildFilterClause({ search = '', category = '' } = {}) {
  const conditions = [];
  const params = [];
  const trimmedSearch = String(search).trim();
  const trimmedCategory = String(category).trim();

  if (trimmedSearch) {
    const idCandidate = Number(trimmedSearch.replace(/^#/, ''));
    const pattern = `%${trimmedSearch}%`;
    if (Number.isInteger(idCandidate) && idCandidate > 0) {
      conditions.push('(product_id = ? OR product_name LIKE ? OR category LIKE ? OR managed_by LIKE ?)');
      params.push(idCandidate, pattern, pattern, pattern);
    } else {
      conditions.push('(product_name LIKE ? OR category LIKE ? OR managed_by LIKE ?)');
      params.push(pattern, pattern, pattern);
    }
  }
  if (trimmedCategory) {
    conditions.push('category = ?');
    params.push(trimmedCategory);
  }

  return {
    whereSql: conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

function parseId(rawId) {
  const id = Number(rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function validateCategory(body = {}) {
  const category_name = String(body.category_name ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!category_name || category_name.length > 50) {
    return { error: 'Category name is required (max 50 characters).' };
  }
  return { value: category_name };
}

function escapeSqlString(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/'/g, "''");
}

async function resequenceCategories(pool) {
  const [rows] = await pool.execute('SELECT category_id FROM categories ORDER BY category_id ASC');
  for (let i = 0; i < rows.length; i += 1) {
    const currentId = Number(rows[i].category_id);
    const targetId = i + 1;
    if (currentId !== targetId) {
      await pool.execute('UPDATE categories SET category_id = ? WHERE category_id = ?', [
        targetId,
        currentId,
      ]);
    }
  }
  return rows.length;
}

async function resequenceProducts(pool) {
  const [rows] = await pool.execute('SELECT product_id FROM products ORDER BY product_id ASC');
  for (let i = 0; i < rows.length; i += 1) {
    const currentId = Number(rows[i].product_id);
    const targetId = i + 1;
    if (currentId !== targetId) {
      await pool.execute('UPDATE products SET product_id = ? WHERE product_id = ?', [
        targetId,
        currentId,
      ]);
    }
  }
  return rows.length;
}

async function syncDatabaseSqlFile(pool) {
  const [catRows] = await pool.execute(
    'SELECT category_name FROM categories ORDER BY category_name ASC'
  );
  const [prodRows] = await pool.execute(
    'SELECT product_name, category, stock_quantity, unit_price, managed_by FROM products ORDER BY product_id ASC'
  );

  const lines = [
    'CREATE DATABASE IF NOT EXISTS inventory_db',
    '    CHARACTER SET utf8mb4',
    '    COLLATE utf8mb4_unicode_ci;',
    '',
    'USE inventory_db;',
    '',
    'CREATE TABLE IF NOT EXISTS categories (',
    '    category_id INT AUTO_INCREMENT PRIMARY KEY,',
    '    category_name VARCHAR(50) NOT NULL UNIQUE',
    ');',
    '',
    'CREATE TABLE IF NOT EXISTS products (',
    '    product_id INT AUTO_INCREMENT PRIMARY KEY,',
    '    product_name VARCHAR(100) NOT NULL,',
    '    category VARCHAR(50) NOT NULL,',
    '    stock_quantity INT NOT NULL CHECK (stock_quantity >= 0),',
    '    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0.00),',
    '    managed_by VARCHAR(60) NOT NULL,',
    '    CONSTRAINT fk_products_category',
    '        FOREIGN KEY (category) REFERENCES categories(category_name)',
    '        ON UPDATE CASCADE',
    '        ON DELETE RESTRICT',
    ');',
    '',
    'SET FOREIGN_KEY_CHECKS = 0;',
    'TRUNCATE TABLE products;',
    'TRUNCATE TABLE categories;',
    'SET FOREIGN_KEY_CHECKS = 1;',
  ];

  if (catRows.length > 0) {
    lines.push('');
    lines.push('INSERT INTO categories (category_name) VALUES');
    catRows.forEach((row, idx) => {
      const suffix = idx === catRows.length - 1 ? ';' : ',';
      lines.push(`('${escapeSqlString(row.category_name)}')${suffix}`);
    });
  }

  if (prodRows.length > 0) {
    lines.push('');
    lines.push(
      'INSERT INTO products (product_name, category, stock_quantity, unit_price, managed_by) VALUES'
    );
    prodRows.forEach((row, idx) => {
      const suffix = idx === prodRows.length - 1 ? ';' : ',';
      const price = Number(row.unit_price).toFixed(2);
      lines.push(
        `('${escapeSqlString(row.product_name)}', '${escapeSqlString(row.category)}', ${Number(row.stock_quantity)}, ${price}, '${escapeSqlString(row.managed_by)}')${suffix}`
      );
    });
  }

  lines.push('');
  fs.writeFileSync(path.join(__dirname, 'database.sql'), lines.join('\n'), 'utf8');
}

function createApp(pool, options = {}) {
  const { syncSqlFile = false } = options;
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
    );
    next();
  });
  app.use(express.json());

  app.get(['/favicon.ico', '/favicon.svg'], (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="3" fill="#0f766e"/></svg>');
  });

  app.use(express.static(path.join(__dirname, 'public')));

  async function resolveCategoryName(category) {
    const [rows] = await pool.execute(
      'SELECT category_name FROM categories WHERE LOWER(category_name) = LOWER(?)',
      [category]
    );
    return rows.length > 0 ? rows[0].category_name : null;
  }

  app.get('/api/categories', async (_req, res) => {
    const sql = `
      SELECT
        c.category_id,
        c.category_name,
        COUNT(p.product_id) AS product_count
      FROM categories c
      LEFT JOIN products p ON p.category = c.category_name
      GROUP BY c.category_id, c.category_name
      ORDER BY c.category_name ASC
    `;
    const [rows] = await pool.execute(sql);
    res.json(
      rows.map((r) => ({
        category_id: Number(r.category_id),
        category_name: r.category_name,
        product_count: Number(r.product_count || 0),
      }))
    );
  });

  app.post('/api/categories', async (req, res) => {
    const { error, value: category_name } = validateCategory(req.body);
    if (error) return res.status(400).json({ error });

    const [existing] = await pool.execute(
      'SELECT category_id, category_name FROM categories WHERE LOWER(category_name) = LOWER(?)',
      [category_name]
    );
    if (existing.length > 0) {
      return res.status(409).json({
        error: `Category "${existing[0].category_name}" already exists.`,
      });
    }

    try {
      const currentCount = await resequenceCategories(pool);
      const nextId = currentCount + 1;
      await pool.execute(
        'INSERT INTO categories (category_id, category_name) VALUES (?, ?)',
        [nextId, category_name]
      );
      if (syncSqlFile) await syncDatabaseSqlFile(pool);
      res.status(201).json({ category_id: nextId, category_name, product_count: 0 });
    } catch (err) {
      if (err && (err.code === 'ER_DUP_ENTRY' || /unique/i.test(err.message || ''))) {
        return res.status(409).json({ error: `Category "${category_name}" already exists.` });
      }
      throw err;
    }
  });

  app.delete('/api/categories/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid category ID.' });

    const [cats] = await pool.execute(
      'SELECT category_id, category_name FROM categories WHERE category_id = ?',
      [id]
    );
    if (cats.length === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    const { category_name } = cats[0];

    const [usage] = await pool.execute(
      'SELECT COUNT(*) AS cnt FROM products WHERE category = ?',
      [category_name]
    );
    const inUseCount = Number(usage[0]?.cnt || 0);
    if (inUseCount > 0) {
      return res.status(409).json({
        error: `Cannot delete "${category_name}" because ${inUseCount} product(s) still use it.`,
      });
    }

    await pool.execute('DELETE FROM categories WHERE category_id = ?', [id]);
    await resequenceCategories(pool);
    if (syncSqlFile) await syncDatabaseSqlFile(pool);
    res.json({ message: 'Category deleted successfully.', category_id: id, category_name });
  });

  app.get('/api/products/summary', async (req, res) => {
    const { whereSql, params } = buildFilterClause(req.query);
    const sql = `
      SELECT
        COUNT(*) AS total_products,
        COALESCE(SUM(stock_quantity), 0) AS total_stock,
        COALESCE(ROUND(AVG(unit_price), 2), 0) AS average_price,
        COALESCE(ROUND(SUM(stock_quantity * unit_price), 2), 0) AS total_inventory_value
      FROM products${whereSql}
    `;
    const [rows] = await pool.execute(sql, params);
    const summary = rows[0] || {};
    res.json({
      total_products: Number(summary.total_products || 0),
      total_stock: Number(summary.total_stock || 0),
      average_price: Number(summary.average_price || 0),
      total_inventory_value: Number(summary.total_inventory_value || 0),
    });
  });

  app.get('/api/products', async (req, res) => {
    const { whereSql, params } = buildFilterClause(req.query);
    const sql = `
      SELECT product_id, product_name, category, stock_quantity, unit_price, managed_by
      FROM products${whereSql}
      ORDER BY product_id ASC
    `;
    const [rows] = await pool.execute(sql, params);
    res.json(
      rows.map((row) => ({
        ...row,
        stock_quantity: Number(row.stock_quantity),
        unit_price: Number(row.unit_price),
      }))
    );
  });

  app.post('/api/products', async (req, res) => {
    const { error, value } = validateProduct(req.body);
    if (error) return res.status(400).json({ error });

    const canonicalCategory = await resolveCategoryName(value.category);
    if (!canonicalCategory) {
      return res.status(400).json({
        error: 'Selected category does not exist. Please add the category first.',
      });
    }
    value.category = canonicalCategory;

    const currentCount = await resequenceProducts(pool);
    const nextId = currentCount + 1;

    const sql = `
      INSERT INTO products (product_id, product_name, category, stock_quantity, unit_price, managed_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await pool.execute(sql, [
      nextId,
      value.product_name,
      value.category,
      value.stock_quantity,
      value.unit_price,
      value.managed_by,
    ]);

    if (syncSqlFile) await syncDatabaseSqlFile(pool);
    res.status(201).json({ product_id: nextId, ...value });
  });

  app.put('/api/products/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

    const { error, value } = validateProduct(req.body);
    if (error) return res.status(400).json({ error });

    const canonicalCategory = await resolveCategoryName(value.category);
    if (!canonicalCategory) {
      return res.status(400).json({
        error: 'Selected category does not exist. Please add the category first.',
      });
    }
    value.category = canonicalCategory;

    const sql = `
      UPDATE products
      SET product_name = ?, category = ?, stock_quantity = ?, unit_price = ?, managed_by = ?
      WHERE product_id = ?
    `;
    const [result] = await pool.execute(sql, [
      value.product_name,
      value.category,
      value.stock_quantity,
      value.unit_price,
      value.managed_by,
      id,
    ]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product record not found.' });
    }
    if (syncSqlFile) await syncDatabaseSqlFile(pool);
    res.json({ product_id: id, ...value });
  });

  app.delete('/api/products/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid product ID.' });

    const [result] = await pool.execute('DELETE FROM products WHERE product_id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Product record not found.' });
    }
    await resequenceProducts(pool);
    if (syncSqlFile) await syncDatabaseSqlFile(pool);
    res.json({ message: 'Product deleted successfully.', product_id: id });
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Database operation failed.' });
  });

  return app;
}

async function bootstrapDatabase({ forceSeed = false } = {}) {
  const { database, ...serverOnlyConfig } = dbConfig;
  const conn = await mysql.createConnection({ ...serverOnlyConfig, multipleStatements: true });
  try {
    const [existingProducts] = await conn
      .query(`SHOW TABLES FROM \`${database}\` LIKE 'products'`)
      .catch(() => [[]]);

    const fullSql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
    const seedIndex = fullSql.indexOf('SET FOREIGN_KEY_CHECKS');
    const schemaSql = seedIndex >= 0 ? fullSql.slice(0, seedIndex) : fullSql;
    const seedPart = seedIndex >= 0 ? fullSql.slice(seedIndex) : '';
    await conn.query(schemaSql);

    if (forceSeed || existingProducts.length === 0) {
      await conn.query(`USE \`${database}\`;\n${seedPart}`);
    }
  } finally {
    await conn.end();
  }
}

function createLocalFallbackPool() {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(os.tmpdir(), 'feni-uni-inventory-local.sqlite');
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA foreign_keys = OFF; DROP TABLE IF EXISTS products; DROP TABLE IF EXISTS categories;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      category_id INTEGER PRIMARY KEY,
      category_name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS products (
      product_id INTEGER PRIMARY KEY,
      product_name TEXT NOT NULL,
      category TEXT NOT NULL,
      stock_quantity INTEGER NOT NULL CHECK (stock_quantity >= 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0.00),
      managed_by TEXT NOT NULL,
      FOREIGN KEY (category) REFERENCES categories(category_name)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
    );
  `);

  const seedSql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
  const catInsert = seedSql.match(/INSERT INTO categories[\s\S]*?;/);
  const prodInsert = seedSql.match(/INSERT INTO products[\s\S]*?;/);

  if (catInsert) db.exec(catInsert[0]);
  if (prodInsert) db.exec(prodInsert[0]);

  return {
    async execute(sql, params = []) {
      const stmt = db.prepare(sql);
      if (sql.trim().toUpperCase().startsWith('SELECT')) {
        return [stmt.all(...params)];
      }
      const res = stmt.run(...params);
      return [{ insertId: Number(res.lastInsertRowid), affectedRows: Number(res.changes) }];
    },
  };
}

if (require.main === module) {
  const forceSeed = process.argv.includes('--seed');
  const port = Number(process.env.PORT || 3000);

  (async () => {
    let pool;
    try {
      await bootstrapDatabase({ forceSeed });
      if (forceSeed) process.exit(0);
      pool = mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: 10,
        decimalNumbers: true,
      });
    } catch (_err) {
      pool = createLocalFallbackPool();
      if (forceSeed) process.exit(0);
    }

    await resequenceCategories(pool);
    await resequenceProducts(pool);
    await syncDatabaseSqlFile(pool);

    const app = createApp(pool, { syncSqlFile: true });
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  })();
}

module.exports = { createApp, validateProduct, validateCategory, buildFilterClause };
