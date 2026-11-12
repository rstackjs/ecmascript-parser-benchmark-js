try { throw new Error("x"); } catch (error) { work(error); } finally { cleanup(); }
