CREATE DATABASE IF NOT EXISTS inventory_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE inventory_db;

CREATE TABLE IF NOT EXISTS categories (
    category_id INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
    product_id INT AUTO_INCREMENT PRIMARY KEY,
    product_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    stock_quantity INT NOT NULL CHECK (stock_quantity >= 0),
    unit_price DECIMAL(10, 2) NOT NULL CHECK (unit_price >= 0.00),
    managed_by VARCHAR(60) NOT NULL,
    CONSTRAINT fk_products_category
        FOREIGN KEY (category) REFERENCES categories(category_name)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE products;
TRUNCATE TABLE categories;
SET FOREIGN_KEY_CHECKS = 1;

INSERT INTO categories (category_name) VALUES
('Cow farm tools'),
('Goat farm tools');

INSERT INTO products (product_name, category, stock_quantity, unit_price, managed_by) VALUES
('Cow Rubber Ear Tag', 'Cow farm tools', 10000, 50.00, 'Rejowan'),
('Cow Rubber Neck Tag', 'Cow farm tools', 10000, 45.00, 'Tanjil'),
('Goat Rubber Ear Tag', 'Goat farm tools', 10000, 40.00, 'Rejowan'),
('Goat Neck Plastic Tag', 'Goat farm tools', 10000, 30.00, 'Tanjil'),
('Cow Neck Plastic Tag', 'Cow farm tools', 10000, 40.00, 'Rejowan'),
('Ear Tag Applicator', 'Cow farm tools', 70, 1550.00, 'Tanjil'),
('Heavy Duty Nylon Cow Collar Belt', 'Cow farm tools', 200, 700.00, 'Rejowan'),
('Automatic Vaccine Gun', 'Cow farm tools', 100, 2500.00, 'Tanjil'),
('Cattle Weight Measuring Tape', 'Cow farm tools', 150, 450.00, 'Rejowan'),
('2.5 Liter Calf Feeder', 'Cow farm tools', 80, 450.00, 'Tanjil'),
('Spring Cattle Nose Ring', 'Cow farm tools', 250, 750.00, 'Rejowan'),
('Trocar Cannula', 'Goat farm tools', 350, 45.00, 'Tanjil'),
('Automatic Cattle Water Bowl', 'Cow farm tools', 75, 1650.00, 'Rejowan'),
('Dairy Farm Management Book', 'Cow farm tools', 45, 600.00, 'Tanjil'),
('Nylon Goat Neck Collar Belt', 'Goat farm tools', 300, 350.00, 'Rejowan');
