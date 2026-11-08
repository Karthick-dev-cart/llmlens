import { refreshDemoProject } from "../lib/demo/refresh.js";

refreshDemoProject().then((result) => {
  console.log(result);
  process.exit(0);
});
