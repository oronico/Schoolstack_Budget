import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import modelsRouter from "./models";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(modelsRouter);

export default router;
