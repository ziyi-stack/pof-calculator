export const onRequestPost = async (context) => {
  const { acctId } = await context.request.json();
  const db = context.env.pof_db;

  const result = await db.prepare(
    "SELECT amount FROM baselines WHERE acct_id = ?"
  ).bind(acctId).first();

  return new Response(JSON.stringify({ 
    baseline: result ? result.amount : 0 
  }));
}