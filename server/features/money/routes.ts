import { expenseListQuerySchema } from '../../../shared/validation/expenses.ts';
import { procedure, router } from '../../lib/trpc.ts';
import * as service from './service.ts';

/** 読み出しだけ。口座と入出金は Money Forward から取り込むもので、画面からは書かない（立替は `expenses` の手続きで書く） */
export const moneyRouter = router({
  accounts: procedure.query(() => service.listAccounts()),
  list: procedure.input(expenseListQuerySchema).query(({ input }) => service.listMoney(input)),
});
