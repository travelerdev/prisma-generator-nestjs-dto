import {
  DTO_RELATION_CAN_CONNECT_ON_UPDATE,
  DTO_RELATION_CAN_CRAEATE_ON_UPDATE,
  DTO_RELATION_MODIFIERS_ON_UPDATE,
  DTO_UPDATE_OPTIONAL,
} from '../annotations';
import {
  isAnnotatedWith,
  isAnnotatedWithOneOf,
  isId,
  isReadOnly,
  isRelation,
  isRequiredWithDefaultValue,
  isUpdatedAt,
} from '../field-classifiers';
import {
  concatIntoArray,
  generateRelationInput,
  getRelationScalars,
  makeImportsFromPrismaClient,
  mapDMMFToParsedField,
  zipImportStatementParams,
} from '../helpers';

import type { DMMF } from '@prisma/generator-helper';
import type { TemplateHelpers } from '../template-helpers';
import type {
  Model,
  UpdateDtoParams,
  ImportStatementParams,
  ParsedField,
} from '../types';
import {
  getDefaultValue,
  isAnnotatedWithDoc,
  PrismaScalarToFormat,
} from '../api-decorator';

interface ComputeUpdateDtoParamsParam {
  model: Model;
  allModels: Model[];
  templateHelpers: TemplateHelpers;
}
export const computeUpdateDtoParams = ({
  model,
  allModels,
  templateHelpers,
}: ComputeUpdateDtoParamsParam): UpdateDtoParams => {
  let hasEnum = false;
  let hasDoc = false;
  let hasDefault = false;
  let hasSpecialType = false;
  const imports: ImportStatementParams[] = [];
  const extraClasses: string[] = [];
  const apiExtraModels: string[] = [];

  const relationScalarFields = getRelationScalars(model.fields);
  const relationScalarFieldNames = Object.keys(relationScalarFields);

  const fields = model.fields.reduce((result, field) => {
    const { name } = field;
    const overrides: Partial<DMMF.Field> = { isRequired: false };

    if (isReadOnly(field)) return result;
    if (isRelation(field)) {
      if (!isAnnotatedWithOneOf(field, DTO_RELATION_MODIFIERS_ON_UPDATE)) {
        return result;
      }
      const relationInputType = generateRelationInput({
        field,
        model,
        allModels,
        templateHelpers,
        preAndSuffixClassName: templateHelpers.updateDtoName,
        canCreateAnnotation: DTO_RELATION_CAN_CRAEATE_ON_UPDATE,
        canConnectAnnotation: DTO_RELATION_CAN_CONNECT_ON_UPDATE,
      });

      overrides.type = relationInputType.type;
      overrides.isList = false;

      concatIntoArray(relationInputType.imports, imports);
      concatIntoArray(relationInputType.generatedClasses, extraClasses);
      concatIntoArray(relationInputType.apiExtraModels, apiExtraModels);
    }
    if (relationScalarFieldNames.includes(name)) return result;

    // fields annotated with @DtoReadOnly are filtered out before this
    // so this safely allows to mark fields that are required in Prisma Schema
    // as **not** required in UpdateDTO
    const isDtoOptional = isAnnotatedWith(field, DTO_UPDATE_OPTIONAL);

    if (!isDtoOptional) {
      if (isId(field)) return result;
      if (isUpdatedAt(field)) return result;
      if (isRequiredWithDefaultValue(field)) return result;
    }

    if (PrismaScalarToFormat[field.type]) hasSpecialType = true;

    if (field.kind === 'enum') hasEnum = true;

    if (isAnnotatedWithDoc(field)) hasDoc = true;

    if (getDefaultValue(field) !== undefined) hasDefault = true;

    return [...result, mapDMMFToParsedField(field, overrides)];
  }, [] as ParsedField[]);

  if (
    apiExtraModels.length ||
    hasEnum ||
    hasDoc ||
    hasDefault ||
    hasSpecialType
  ) {
    const destruct = [];
    if (apiExtraModels.length) destruct.push('ApiExtraModels');
    if (hasEnum || hasDoc || hasDefault || hasSpecialType)
      destruct.push('ApiProperty');
    imports.unshift({ from: '@nestjs/swagger', destruct });
  }

  const importPrismaClient = makeImportsFromPrismaClient(fields);
  if (importPrismaClient) imports.unshift(importPrismaClient);

  return {
    model,
    fields,
    imports: zipImportStatementParams(imports),
    extraClasses,
    apiExtraModels,
  };
};
