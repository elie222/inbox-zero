// do not return functions to the client or we'll get an error
export const isStatusOk = (status: number) => status >= 200 && status < 300;
