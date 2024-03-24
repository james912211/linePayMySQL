const mysql = require("mysql");
const util = require("util");

const pool = mysql.createPool({
  connectionLimit: 10,
  host: "127.0.0.1",
  user: "root",
  password: "",
  database: "fang_project",
});

pool.query = util.promisify(pool.query); // 將 pool.query 轉換為 Promise 形式

module.exports = pool;
