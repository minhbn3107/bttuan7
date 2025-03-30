require("dotenv").config();
const express = require("express");
const app = express();
const path = require("path");
const { v4: uuid } = require("uuid");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("./views"));
app.set("view engine", "ejs");
app.set("views", "./views");

const AWS = require("aws-sdk");

AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: "ap-southeast-1",
});

const s3 = new AWS.S3();

const dynamoDb = new AWS.DynamoDB();
const docClient = new AWS.DynamoDB.DocumentClient();

const TableName = "Sanpham";

const multer = require("multer");

const storage = multer.memoryStorage({
    destination(req, file, callback) {
        callback(null, "");
    },
});

function checkFileType(file, cb) {
    const fileTypes = /jpeg|jpg|png|gif/;

    const extname = fileTypes.test(
        path.extname(file.originalname).toLowerCase()
    );
    const mimetype = fileTypes.test(file.mimetype);
    if (extname && mimetype) {
        return cb(null, true);
    }

    return cb("Error: Image Only");
}

const upload = multer({
    storage,
    limits: { fileSize: 2000000 },
    fileFilter(req, file, cb) {
        checkFileType(file, cb);
    },
}).single("image");

const CLOUD_FRONT_URL = "https://d3l2l6ry2s34fe.cloudfront.net/";

app.get("/", (req, res) => {
    try {
        dynamoDb.scan(
            {
                TableName,
            },
            (err, data) => {
                if (err) res.send(err.message);

                res.render("index", {
                    sanPhams: data.Items,
                });
            }
        );
    } catch (error) {
        res.send(error);
    }
});

app.post("/", upload, (req, res) => {
    if (!req.file) {
        return res.status(400).send("No file uploaded.");
    }

    const { ma_sp, ten_sp, so_luong } = req.body;
    const image = req.file.originalname.split(".");

    const fileType = image[image.length - 1];

    const filePath = `${uuid() + Date.now().toString()}.${fileType}`;
    const params = {
        Bucket: "uploads3tutorialbucket1",
        Key: filePath,
        Body: req.file.buffer,
    };

    s3.upload(params, (error, data) => {
        if (error) {
            console.log("error = ", error);
            return res.send("Internal Server Error");
        } else {
            const newItem = {
                TableName,
                Item: {
                    ma_sp,
                    ten_sp,
                    so_luong,
                    image_url: `${CLOUD_FRONT_URL}${filePath}`,
                },
            };

            docClient.put(newItem, (err, data) => {
                if (err) {
                    return res.send("Internal Server Error");
                } else {
                    return res.redirect("/");
                }
            });
        }
    });
});

app.post("/delete", (req, res) => {
    try {
        const { ma_sp } = req.body;

        docClient.delete(
            {
                TableName,
                Key: {
                    ma_sp,
                },
            },
            (err, data) => {
                if (err) res.send("error");
                res.redirect("/");
            }
        );
    } catch (error) {
        res.send("error");
    }
});

app.listen(3000, () => {
    console.log("App is running on port 3000");
});
