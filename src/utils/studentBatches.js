const normalizeName = (value) => (typeof value === 'string' ? value.trim() : '');

const sortNames = (left, right) => (
  left.localeCompare(right, undefined, { sensitivity: 'base', numeric: true })
);

const dedupeNames = (values = []) => {
  const seen = new Set();
  const unique = [];

  values.forEach((value) => {
    const normalized = normalizeName(value);
    if (!normalized) return;

    const key = normalized.toLowerCase();
    if (seen.has(key)) return;

    seen.add(key);
    unique.push(normalized);
  });

  return unique.sort(sortNames);
};

const sortObjectEntries = (entries = []) => (
  [...entries].sort(([left], [right]) => sortNames(left, right))
);

export const normalizeStudentBatchesConfig = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      success: false,
      message: 'studentBatches must be an object keyed by degree and department',
    };
  }

  const normalizedDegrees = {};

  for (const [degreeKey, departmentValue] of Object.entries(value)) {
    const degree = normalizeName(degreeKey);
    if (!degree) continue;

    if (!departmentValue || typeof departmentValue !== 'object' || Array.isArray(departmentValue)) {
      return {
        success: false,
        message: `studentBatches.${degree} must be an object keyed by department`,
      };
    }

    const normalizedDepartments = {};

    for (const [departmentKey, batchesValue] of Object.entries(departmentValue)) {
      const department = normalizeName(departmentKey);
      if (!department) continue;

      if (!Array.isArray(batchesValue)) {
        return {
          success: false,
          message: `studentBatches.${degree}.${department} must be an array of batch names`,
        };
      }

      normalizedDepartments[department] = dedupeNames(batchesValue);
    }

    normalizedDegrees[degree] = Object.fromEntries(sortObjectEntries(Object.entries(normalizedDepartments)));
  }

  return {
    success: true,
    value: Object.fromEntries(sortObjectEntries(Object.entries(normalizedDegrees))),
  };
};

export const getBatchOptionsFromConfig = (configValue = {}, filters = {}) => {
  const degreeFilter = normalizeName(filters.degree);
  const departmentFilter = normalizeName(filters.department);
  const batches = [];

  for (const [degree, departments] of Object.entries(configValue || {})) {
    if (degreeFilter && degree !== degreeFilter) continue;

    for (const [department, departmentBatches] of Object.entries(departments || {})) {
      if (departmentFilter && department !== departmentFilter) continue;
      batches.push(...(Array.isArray(departmentBatches) ? departmentBatches : []));
    }
  }

  return dedupeNames(batches);
};

export const hasConfiguredBatch = (configValue = {}, { degree, department, batch } = {}) => {
  const normalizedDegree = normalizeName(degree);
  const normalizedDepartment = normalizeName(department);
  const normalizedBatch = normalizeName(batch);

  if (!normalizedDegree || !normalizedDepartment || !normalizedBatch) return false;

  const configuredBatches = configValue?.[normalizedDegree]?.[normalizedDepartment];
  if (!Array.isArray(configuredBatches)) return false;

  return configuredBatches.some((configuredBatch) => configuredBatch.toLowerCase() === normalizedBatch.toLowerCase());
};

export const renameBatchInConfig = (configValue = {}, { degree, department, oldName, newName } = {}) => {
  const normalizedDegree = normalizeName(degree);
  const normalizedDepartment = normalizeName(department);
  const normalizedOldName = normalizeName(oldName);
  const normalizedNewName = normalizeName(newName);

  const nextConfig = structuredClone(configValue || {});
  const currentBatches = nextConfig?.[normalizedDegree]?.[normalizedDepartment];

  if (!normalizedDegree || !normalizedDepartment || !normalizedOldName || !normalizedNewName || !Array.isArray(currentBatches)) {
    return nextConfig;
  }

  nextConfig[normalizedDegree][normalizedDepartment] = dedupeNames(
    currentBatches.map((batch) => (batch === normalizedOldName ? normalizedNewName : batch))
  );

  return nextConfig;
};

export const renameDegreeInConfig = (configValue = {}, { oldName, newName } = {}) => {
  const normalizedOldName = normalizeName(oldName);
  const normalizedNewName = normalizeName(newName);

  const nextConfig = structuredClone(configValue || {});
  if (!normalizedOldName || !normalizedNewName || !nextConfig[normalizedOldName]) {
    return nextConfig;
  }

  const existingTarget = nextConfig[normalizedNewName] || {};
  const movedValue = nextConfig[normalizedOldName] || {};

  const mergedDepartments = {};
  const allDepartmentKeys = new Set([
    ...Object.keys(existingTarget),
    ...Object.keys(movedValue),
  ]);

  [...allDepartmentKeys].forEach((department) => {
    mergedDepartments[department] = dedupeNames([
      ...(existingTarget[department] || []),
      ...(movedValue[department] || []),
    ]);
  });

  delete nextConfig[normalizedOldName];
  nextConfig[normalizedNewName] = Object.fromEntries(sortObjectEntries(Object.entries(mergedDepartments)));

  return Object.fromEntries(sortObjectEntries(Object.entries(nextConfig)));
};

export const renameDepartmentInConfig = (configValue = {}, { oldName, newName } = {}) => {
  const normalizedOldName = normalizeName(oldName);
  const normalizedNewName = normalizeName(newName);
  const nextConfig = structuredClone(configValue || {});

  if (!normalizedOldName || !normalizedNewName) {
    return nextConfig;
  }

  for (const degree of Object.keys(nextConfig)) {
    const departments = nextConfig[degree] || {};
    if (!departments[normalizedOldName]) continue;

    const mergedBatches = dedupeNames([
      ...(departments[normalizedNewName] || []),
      ...(departments[normalizedOldName] || []),
    ]);

    delete departments[normalizedOldName];
    departments[normalizedNewName] = mergedBatches;
    nextConfig[degree] = Object.fromEntries(sortObjectEntries(Object.entries(departments)));
  }

  return Object.fromEntries(sortObjectEntries(Object.entries(nextConfig)));
};

export default {
  normalizeStudentBatchesConfig,
  getBatchOptionsFromConfig,
  hasConfiguredBatch,
  renameBatchInConfig,
  renameDegreeInConfig,
  renameDepartmentInConfig,
};
