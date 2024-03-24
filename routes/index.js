const express = require("express");
const axios = require("axios");
const hmacSHA256 = require("crypto-js/hmac-sha256");
const Base64 = require("crypto-js/enc-base64");
const pool = require("../models/mysql");
const router = express.Router();
require("dotenv").config();

// 環境變數
const {
  LINEPAY_CHANNEL_ID,
  LINEPAY_RETURN_HOST,
  LINEPAY_SITE,
  LINEPAY_VERSION,
  LINEPAY_CHANNEL_SECRET_KEY,
  LINEPAY_RETURN_CONFIRM_URL,
  LINEPAY_RETURN_CANCEL_URL,
} = process.env;

const orders = {};

router
  .get("/", function (req, res, next) {
    res.render("index", { title: "Express" });
  })
  .get("/checkout/:tradeNo", async (req, res) => {
    const { tradeNo } = req.params;
    const [orders] = await pool.query(
      `SELECT id, trade_no, trade_amt FROM table_orders WHERE trade_no = ?`,
      [tradeNo]
    );

    res.render("checkout", { orders });
  })
  .get("/success/:orderId", async (req, res) => {
    const { orderId } = req.params;
    const [orders] = await pool.query(
      `SELECT id, trade_no, trade_amt FROM table_orders WHERE trade_no = ?`,
      [orderId]
    );

    res.render("success", { orders });
  });

router
  .post("/linePay/:tradeNo", async (req, res) => {
    const { tradeNo } = req.params;
    try {
      const [orders] = await pool.query(
        `SELECT id, trade_no, trade_amt FROM table_orders WHERE trade_no = ?`,
        [tradeNo]
      );
      const [orderItems] = await pool.query(
        `SELECT od.food_id, od.quantity, od.unit_price, f.name 
            FROM orders_items od 
            JOIN foods f ON od.food_id = f.id 
            WHERE od.order_id = ?`,
        [orders.id] // 使用订单ID查询详情
      );
      //轉成linepay格式
      const linepayData = {
        amount: orders.trade_amt,
        currency: "TWD",
        packages: [
          {
            id: orders.id,
            amount: orders.trade_amt,
            products: [
              {
                name: "芳鍋",
                quantity: "1",
                price: orders.trade_amt,
              },
            ],
          },
        ],
        orderId: orders.trade_no,
      };
      // console.log(linepayData.packages[0].products);

      // 建立 LINE Pay 請求規定的資料格式
      const linePayBody = createLinePayBody(linepayData);
      // CreateSignature 建立加密內容
      const uri = "/payments/request";
      const headers = createSignature(uri, linePayBody);
      const url = `${LINEPAY_SITE}/${LINEPAY_VERSION}${uri}`;
      const linePayRes = await axios.post(url, linePayBody, { headers });
      // console.log(linePayRes);
      // 請求成功...
      if (linePayRes?.data?.returnCode === "0000") {
        res.redirect(linePayRes?.data?.info.paymentUrl.web);
      } else {
        res.status(400).send({
          message: "訂單不存在",
        });
      }
    } catch (err) {
      console.log(err);
    }
  })
  .get("/linePay/confirm", async (req, res) => {
    const { transactionId, orderId } = req.query;
    try {
      const [orders] = await pool.query(
        `SELECT id, trade_no, trade_amt FROM table_orders WHERE trade_no = ?`,
        [orderId]
      );

      const linePayBody = {
        amount: orders.trade_amt,
        currency: "TWD",
      };

      const uri = `/payments/${transactionId}/confirm`;
      const headers = createSignature(uri, linePayBody);
      const url = `${LINEPAY_SITE}/${LINEPAY_VERSION}${uri}`;
      const linePayRes = await axios.post(url, linePayBody, { headers });
      if (linePayRes?.data?.returnCode === "0000") {
        res.redirect(`/success/${orderId}`);
      } else {
        res.status(400).send({
          message: linePayRes,
        });
      }
    } catch (err) {
      console.log(err);
    }
  });

function createLinePayBody(order) {
  return {
    ...order,
    currency: "TWD",
    redirectUrls: {
      confirmUrl: `${LINEPAY_RETURN_HOST}${LINEPAY_RETURN_CONFIRM_URL}`,
      cancelUrl: `${LINEPAY_RETURN_HOST}${LINEPAY_RETURN_CANCEL_URL}`,
    },
  };
}

function createSignature(uri, linePayBody) {
  const nonce = new Date().getTime();
  const encrypt = hmacSHA256(
    `${LINEPAY_CHANNEL_SECRET_KEY}/${LINEPAY_VERSION}${uri}${JSON.stringify(
      linePayBody
    )}${nonce}`,
    LINEPAY_CHANNEL_SECRET_KEY
  );
  const signature = Base64.stringify(encrypt);

  const headers = {
    "X-LINE-ChannelId": LINEPAY_CHANNEL_ID,
    "Content-Type": "application/json",
    "X-LINE-Authorization-Nonce": nonce,
    "X-LINE-Authorization": signature,
  };
  return headers;
}

module.exports = router;
