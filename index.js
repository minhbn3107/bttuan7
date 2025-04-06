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
const docClient = new AWS.DynamoDB.DocumentClient();

const TableName = "Sanpham";
const BucketName = "uploads3tutorialbucket1";
const CLOUD_FRONT_URL = "https://d3l2l6ry2s34fe.cloudfront.net/";

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
});

function getS3KeyFromUrl(url) {
    return url.replace(CLOUD_FRONT_URL, "");
}

app.get("/", (req, res) => {
    try {
        docClient.scan({ TableName }, (err, data) => {
            if (err) res.send(err.message);

            res.render("index", { items: data.Items });
        });
    } catch (error) {
        res.send(error);
    }
});

app.post("/", upload.single("image"), (req, res) => {
    if (!req.file) {
        return res.status(400).send("No file uploaded.");
    }

    const { ma_sp, ten_sp, so_luong } = req.body;
    const image = req.file.originalname.split(".");
    const fileType = image[image.length - 1];
    const filePath = `${uuid() + Date.now().toString()}.${fileType}`;

    if (!so_luong || isNaN(so_luong) || parseInt(so_luong) <= 0) {
        return res.status(400).send("Số lượng phải là số lớn hơn 0");
    }

    const params = {
        Bucket: BucketName,
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

app.get("/edit/:ma_sp", (req, res) => {
    const { ma_sp } = req.params;

    const params = {
        TableName,
        Key: {
            ma_sp,
        },
    };

    docClient.get(params, (err, data) => {
        if (err) {
            return res.send("Internal Server Error");
        }
        if (!data.Item) {
            return res.status(404).send("Product not found");
        }

        res.render("edit", { product: data.Item });
    });
});

app.post("/edit/:ma_sp", (req, res) => {
    const { ma_sp } = req.params;
    const { ten_sp, so_luong } = req.body;

    if (!so_luong || isNaN(so_luong) || parseInt(so_luong) <= 0) {
        return res.status(400).send("Số lượng phải là số lớn hơn 0");
    }

    const updateParams = {
        TableName,
        Key: {
            ma_sp,
        },
        UpdateExpression: "set ten_sp = :t, so_luong = :s",
        ExpressionAttributeValues: {
            ":t": ten_sp,
            ":s": so_luong,
        },
        ReturnValues: "UPDATED_NEW",
    };

    docClient.update(updateParams, (err, data) => {
        if (err) {
            console.error("Error updating product:", err);
            return res.send("Internal Server Error");
        }
        res.redirect("/");
    });
});

app.post("/delete", async (req, res) => {
    const { ma_sp } = req.body;
    if (!ma_sp) {
        return res.redirect("/");
    }

    const idsToDelete = Array.isArray(ma_sp) ? ma_sp : [ma_sp];

    try {
        for (const id of idsToDelete) {
            const getParams = {
                TableName,
                Key: {
                    ma_sp: id,
                },
            };

            const { Item } = await docClient.get(getParams).promise();

            if (Item && Item.image_url) {
                const imageKey = getS3KeyFromUrl(Item.image_url);
                const s3Params = {
                    Bucket: BucketName,
                    Key: imageKey,
                };
                await s3.deleteObject(s3Params).promise();
            }

            const deleteParams = {
                TableName,
                Key: {
                    ma_sp: id,
                },
            };
            await docClient.delete(deleteParams).promise();
        }
        res.redirect("/");
    } catch (err) {
        console.error("Error during deletion:", err);
        res.status(500).send("Internal Server Error");
    }
});

app.listen(3000, () => {
    console.log("App is running on port 3000");
});
