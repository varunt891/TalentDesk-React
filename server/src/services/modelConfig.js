const splitModelList = value => String(value || '')
  .split(',')
  .map(model => model.trim())
  .filter(Boolean);

export const getConfiguredModels = ({ primaryEnv, fallbackEnv, defaults }) => {
  const models = [
    ...splitModelList(process.env[primaryEnv]),
    ...splitModelList(process.env[fallbackEnv]),
    ...(defaults || [])
  ];

  return [...new Set(models.filter(Boolean))];
};
