"use strict";
import fs from "fs";
import { Parser } from "./parser";
const parser = new Parser();
const buffer = fs.readFileSync("utf-8.ttyrec", {
  encoding: null
});
parser.parse(buffer);
