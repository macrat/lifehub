import { transactionListQuerySchema } from '../../../shared/validation/money.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** 読み出しだけ。口座と入出金は Money Forward から取り込むもので、画面からは書かない */
export const moneyRouter = router({
  accounts: procedure.query(() => service.listAccounts()),
  transactions: procedure
    .input(transactionListQuerySchema)
    .query(({ input }) => service.listTransactions(input)),
});
