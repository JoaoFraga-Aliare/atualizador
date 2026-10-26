export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Central de Atualização API',
    version: '1.0.0',
    description: 'API para distribuir atualizações, registrar instalações e administrar produtos e releases.'
  },
  servers: [{ url: '/', description: 'Servidor atual' }],
  tags: [{ name: 'Status' }, { name: 'Autenticação' }, { name: 'Instalações' }, { name: 'Administração' }],
  paths: {
    '/api/v1/packages/signing-key': {
      get: {
        tags: ['Status'],
        summary: 'Chave pública que assina as publicações',
        description: 'Público. publicKey é a chave Ed25519 crua (32 bytes) em Base64.',
        responses: {
          200: {
            description: 'Chave pública',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    algorithm: { type: 'string', example: 'ed25519' },
                    payloadFormat: { type: 'string', example: 'agrosys-release-v1' },
                    keyId: { type: 'string' },
                    publicKey: { type: 'string' },
                    publicKeyPem: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/health': {
      get: {
        tags: ['Status'],
        summary: 'Verifica a disponibilidade',
        responses: {
          200: {
            description: 'API disponível',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Health' } } }
          }
        }
      }
    },
    '/api/v1/versions/resolve-hash': {
      post: {
        tags: ['Instalações'],
        summary: 'Resolve a versão homologada pelo hash do executável',
        security: [{ InstallationKey: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['executableHash'],
                properties: {
                  executableHash: { type: 'string', pattern: '^[A-Fa-f0-9]{64}$' },
                  product: { type: 'string', default: 'pdv' },
                  channel: { type: 'string', enum: ['test', 'beta', 'production'] }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Versão homologada e nota técnica' },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' }
        }
      }
    },
    '/api/v1/auth/login': {
      post: {
        tags: ['Autenticação'],
        summary: 'Autentica um administrador',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } }
        },
        responses: {
          200: {
            description: 'Login realizado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/me/api-token': {
      get: {
        tags: ['Administração'],
        summary: 'Consulta o token e seus escopos de upload',
        security: [{ AdminBearer: [] }],
        responses: {
          200: { description: 'Estado do token e produtos/canais permitidos' },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      },
      post: {
        tags: ['Administração'],
        summary: 'Gera ou substitui o token com produtos e canais',
        security: [{ AdminBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiTokenScope' } } }
        },
        responses: {
          201: {
            description: 'Token gerado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiTokenCreated' } } }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      },
      delete: {
        tags: ['Administração'],
        summary: 'Revoga o token de upload do usuário',
        security: [{ AdminBearer: [] }],
        responses: { 200: { description: 'Token revogado' }, 401: { $ref: '#/components/responses/Unauthorized' } }
      }
    },
    '/api/v1/ci/artifacts': {
      post: {
        tags: ['Administração'],
        summary: 'Envia um ZIP compilado pelo CI/CD',
        security: [{ ApiToken: [] }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { $ref: '#/components/schemas/CiArtifactCreate' } } }
        },
        responses: {
          201: { description: 'Artefato pendente' },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/artifacts': {
      get: {
        tags: ['Administração'],
        summary: 'Lista os artefatos CI/CD do usuário autenticado',
        security: [{ AdminBearer: [] }],
        responses: { 200: { description: 'Artefatos pendentes' }, 401: { $ref: '#/components/responses/Unauthorized' } }
      }
    },
    '/api/v1/updates/check': {
      post: {
        tags: ['Instalações'],
        summary: 'Registra a instalação e procura uma atualização',
        security: [{ InstallationKey: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateCheckRequest' } } }
        },
        responses: {
          200: {
            description: 'Resultado da consulta',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/UpdateAvailable' },
                    { $ref: '#/components/schemas/UpdateUnavailable' }
                  ]
                }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/updates/events': {
      post: {
        tags: ['Instalações'],
        summary: 'Registra um evento da atualização',
        security: [{ InstallationKey: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateEventRequest' } } }
        },
        responses: {
          202: {
            description: 'Evento aceito',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { accepted: { type: 'boolean', example: true } } }
              }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' }
        }
      }
    },
    '/api/v1/errors': {
      post: {
        tags: ['Instalações'],
        summary: 'Registra um erro interno do PDV',
        security: [{ InstallationKey: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ApplicationErrorCreate' } } }
        },
        responses: {
          201: {
            description: 'Erro registrado',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    accepted: { type: 'boolean' },
                    id: { type: 'integer' },
                    screenshotStored: { type: 'boolean' }
                  }
                }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/dashboard': {
      get: {
        tags: ['Administração'],
        summary: 'Obtém os indicadores do painel por canais',
        security: [{ AdminBearer: [] }],
        parameters: [
          {
            name: 'channel',
            in: 'query',
            schema: { type: 'string', default: 'production,beta,test' },
            description: 'Um ou mais canais separados por vírgula.'
          }
        ],
        responses: {
          200: {
            description: 'Indicadores',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Dashboard' } } }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/clients': {
      get: {
        tags: ['Administração'],
        summary: 'Lista os clientes',
        security: [{ AdminBearer: [] }],
        responses: {
          200: {
            description: 'Clientes cadastrados',
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Client' } } }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/clients/{id}/terminals': {
      get: {
        tags: ['Administração'],
        summary: 'Lista os terminais de um cliente',
        security: [{ AdminBearer: [] }],
        parameters: [{ $ref: '#/components/parameters/Id' }],
        responses: {
          200: {
            description: 'Terminais do cliente',
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Terminal' } } }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/products': {
      get: {
        tags: ['Administração'],
        summary: 'Lista os produtos',
        security: [{ AdminBearer: [] }],
        responses: {
          200: {
            description: 'Produtos cadastrados',
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Product' } } }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      },
      post: {
        tags: ['Administração'],
        summary: 'Cria um produto',
        security: [{ AdminBearer: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ProductCreate' } } }
        },
        responses: {
          201: {
            description: 'Produto criado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreatedId' } } }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/releases': {
      get: {
        tags: ['Administração'],
        summary: 'Lista as releases',
        security: [{ AdminBearer: [] }],
        responses: {
          200: {
            description: 'Releases cadastradas',
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Release' } } }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      },
      post: {
        tags: ['Administração'],
        summary: 'Publica uma release',
        security: [{ AdminBearer: [] }],
        requestBody: {
          required: true,
          content: { 'multipart/form-data': { schema: { $ref: '#/components/schemas/ReleaseCreate' } } }
        },
        responses: {
          201: {
            description: 'Release publicada',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { id: { type: 'integer' }, sha256: { type: 'string' } } }
              }
            }
          },
          400: { $ref: '#/components/responses/BadRequest' },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/releases/{id}': {
      patch: {
        tags: ['Administração'],
        summary: 'Ativa ou desativa uma release',
        security: [{ AdminBearer: [] }],
        parameters: [{ $ref: '#/components/parameters/Id' }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['active'], properties: { active: { type: 'boolean' } } }
            }
          }
        },
        responses: {
          200: {
            description: 'Release alterada',
            content: {
              'application/json': {
                schema: { type: 'object', properties: { updated: { type: 'boolean', example: true } } }
              }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/logs': {
      get: {
        tags: ['Administração'],
        summary: 'Lista o histórico de publicação e atualização',
        security: [{ AdminBearer: [] }],
        parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 100, maximum: 500 } }],
        responses: {
          200: {
            description: 'Eventos mais recentes',
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/UpdateLog' } } }
            }
          },
          401: { $ref: '#/components/responses/Unauthorized' }
        }
      }
    },
    '/api/v1/admin/errors': {
      get: {
        tags: ['Administração'],
        summary: 'Lista os erros internos recebidos',
        security: [{ AdminBearer: [] }],
        responses: {
          200: {
            description: 'Erros mais recentes',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/ApplicationError' } }
              }
            }
          }
        }
      }
    },
    '/api/v1/admin/errors/analysis': {
      get: {
        tags: ['Administração'],
        summary: 'Filtra e agrupa erros distintos em um período máximo de 90 dias',
        security: [{ AdminBearer: [] }],
        parameters: [
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'exception', in: 'query', schema: { type: 'string' } },
          { name: 'client', in: 'query', schema: { type: 'string' } },
          { name: 'version', in: 'query', schema: { type: 'string' } },
          { name: 'product', in: 'query', schema: { type: 'string' } },
          { name: 'channel', in: 'query', schema: { type: 'string' } }
        ],
        responses: {
          200: { description: 'Erros distintos, opções de filtros e gráficos' },
          400: { $ref: '#/components/responses/BadRequest' }
        }
      }
    },
    '/api/v1/admin/terminals/{id}/errors/analysis': {
      get: {
        tags: ['Administração'],
        summary: 'Filtra e agrupa erros distintos de um terminal',
        security: [{ AdminBearer: [] }],
        parameters: [
          { $ref: '#/components/parameters/Id' },
          { name: 'startDate', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'endDate', in: 'query', schema: { type: 'string', format: 'date' } }
        ],
        responses: {
          200: { description: 'Análise limitada ao terminal informado' },
          404: { $ref: '#/components/responses/NotFound' }
        }
      }
    },
    '/api/v1/admin/errors/{id}': {
      get: {
        tags: ['Administração'],
        summary: 'Obtém os detalhes de um erro',
        security: [{ AdminBearer: [] }],
        parameters: [{ $ref: '#/components/parameters/Id' }],
        responses: { 200: { description: 'Detalhes do erro' }, 404: { $ref: '#/components/responses/NotFound' } }
      }
    },
    '/api/v1/admin/errors/{id}/screenshot': {
      get: {
        tags: ['Administração'],
        summary: 'Descriptografa e entrega temporariamente o print',
        security: [{ AdminBearer: [] }],
        parameters: [{ $ref: '#/components/parameters/Id' }],
        responses: { 200: { description: 'Imagem sem cache' }, 404: { $ref: '#/components/responses/NotFound' } }
      }
    },
    '/api/v1/admin/errors/settings': {
      get: {
        tags: ['Administração'],
        summary: 'Obtém a configuração de armazenamento de prints',
        security: [{ AdminBearer: [] }],
        responses: { 200: { description: 'Configuração atual' } }
      },
      patch: {
        tags: ['Administração'],
        summary: 'Configura o armazenamento de prints',
        security: [{ AdminBearer: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['storeScreenshot'],
                properties: { storeScreenshot: { type: 'boolean' } }
              }
            }
          }
        },
        responses: { 200: { description: 'Configuração atualizada' } }
      }
    }
  },
  components: {
    securitySchemes: {
      AdminBearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token retornado pelo login administrativo.'
      },
      InstallationKey: { type: 'http', scheme: 'bearer', description: 'Chave definida em INSTALLATION_KEY.' },
      ApiToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Token individual gerado em /api/v1/admin/me/api-token.'
      }
    },
    parameters: { Id: { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } } },
    responses: {
      BadRequest: {
        description: 'Requisição inválida',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
      },
      Unauthorized: {
        description: 'Credencial ausente ou inválida',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
      },
      NotFound: {
        description: 'Registro não encontrado',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
      }
    },
    schemas: {
      Health: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean', example: true } } },
      Error: {
        type: 'object',
        required: ['error'],
        properties: { error: { type: 'string', example: 'unauthorized' } }
      },
      CreatedId: { type: 'object', properties: { id: { type: 'integer', example: 1 } } },
      LoginRequest: {
        type: 'object',
        required: ['user', 'password'],
        properties: { user: { type: 'string', example: 'admin' }, password: { type: 'string', format: 'password' } }
      },
      LoginResponse: {
        type: 'object',
        properties: { token: { type: 'string', description: 'JWT válido por oito horas.' } }
      },
      ApiTokenScope: {
        type: 'object',
        required: ['productIds', 'channels'],
        properties: {
          productIds: { type: 'array', minItems: 1, items: { type: 'integer' } },
          channels: { type: 'array', minItems: 1, items: { type: 'string', enum: ['test', 'beta', 'production'] } }
        }
      },
      ApiTokenCreated: {
        type: 'object',
        required: ['token', 'productIds', 'channels'],
        properties: {
          token: { type: 'string', description: 'Exibido somente nesta resposta.' },
          productIds: { type: 'array', items: { type: 'integer' } },
          channels: { type: 'array', items: { type: 'string' } },
          createdAt: { type: 'string', format: 'date-time' }
        }
      },
      CiArtifactCreate: {
        type: 'object',
        required: ['artifact', 'version'],
        properties: {
          artifact: { type: 'string', format: 'binary' },
          product: { type: 'string', default: 'pdv' },
          version: { type: 'string' }
        }
      },
      ClientInput: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string', example: 'uuid-cliente' },
          name: { type: 'string', example: 'Cliente Exemplo' },
          document: { type: 'string', nullable: true, example: '12345678000190' }
        }
      },
      TerminalInput: {
        type: 'object',
        required: ['id', 'name'],
        properties: {
          id: { type: 'string', example: 'uuid-terminal' },
          name: { type: 'string', example: 'CAIXA 01' },
          computerName: { type: 'string', nullable: true, example: 'PC-01' },
          osVersion: { type: 'string', nullable: true, example: 'Windows 11' }
        }
      },
      UpdateCheckRequest: {
        type: 'object',
        required: ['client', 'terminal'],
        properties: {
          client: { $ref: '#/components/schemas/ClientInput' },
          terminal: { $ref: '#/components/schemas/TerminalInput' },
          product: { type: 'string', default: 'pdv' },
          channel: { type: 'string', enum: ['test', 'beta', 'production'], default: 'production' },
          currentVersion: { type: 'string', default: '0.0.0', example: '1.0.0' }
        }
      },
      UpdateAvailable: {
        type: 'object',
        required: [
          'available',
          'releaseId',
          'version',
          'artifactType',
          'mandatory',
          'deadlineAt',
          'downloadUrl',
          'sha256',
          'sizeBytes',
          'showNotesPdv'
        ],
        properties: {
          available: { type: 'boolean', enum: [true] },
          releaseId: { type: 'string', description: 'Identificador estável da publicação.' },
          version: { type: 'string' },
          mandatory: {
            type: 'boolean',
            description: 'Verdadeiro quando configurada como obrigatória ou quando o prazo venceu.'
          },
          signature: {
            type: 'string',
            description:
              'Assinatura Ed25519 em Base64 do texto agrosys-release-v1 (releaseId, product, channel, version, sha256 e sizeBytes, um por linha).'
          },
          signatureKeyId: { type: 'string', description: 'Primeiros 16 hex do SHA-256 da chave pública usada.' },
          signatureAlgorithm: { type: 'string', example: 'ed25519' },
          signedPayloadFormat: { type: 'string', example: 'agrosys-release-v1' },
          mandatoryNow: {
            type: 'boolean',
            description:
              'Mesmo valor de mandatory; lido pelo Atualizador do PDV para decidir se a atualização é obrigatória agora.'
          },
          mandatoryReason: { type: 'string', enum: ['configured', 'deadline'], nullable: true },
          deadlineAt: { type: 'string', format: 'date-time', nullable: true },
          deadlineExpired: { type: 'boolean' },
          minimumVersion: { type: 'string', nullable: true },
          artifactType: { type: 'string', enum: ['package', 'sql'] },
          fileName: { type: 'string' },
          downloadUrl: { type: 'string', format: 'uri' },
          sha256: { type: 'string' },
          sizeBytes: { type: 'integer' },
          notes: {
            type: 'string',
            nullable: true,
            description: 'Nota técnica para o PDV. Retorna null quando a exibição não foi habilitada.'
          },
          showNotesPdv: { type: 'boolean', description: 'Indica se o PDV deve exibir notes.' }
        }
      },
      UpdateUnavailable: {
        type: 'object',
        required: ['available', 'currentVersion'],
        properties: { available: { type: 'boolean', enum: [false] }, currentVersion: { type: 'string' } }
      },
      UpdateEventRequest: {
        type: 'object',
        required: ['terminalId', 'status'],
        properties: {
          terminalId: { type: 'string', example: 'uuid-terminal' },
          previousVersion: { type: 'string', nullable: true },
          targetVersion: { type: 'string', nullable: true },
          status: { type: 'string', example: 'installed' },
          message: { type: 'string', nullable: true }
        }
      },
      ApplicationErrorCreate: {
        type: 'object',
        required: ['terminalId', 'salt', 'iv', 'authTag', 'ciphertext'],
        properties: {
          terminalId: {
            type: 'string',
            description:
              "UUID persistido. O IKM do HKDF é UTF8(lower(trim(terminalId)) + ':' + INSTALLATION_KEY), mantendo o token sem alteração."
          },
          product: {
            type: 'string',
            default: 'pdv',
            description: 'Usado somente se o terminal ainda não estiver cadastrado.'
          },
          salt: { type: 'string', format: 'byte', description: 'Salt aleatório usado no HKDF.' },
          iv: { type: 'string', format: 'byte', description: 'IV de 12 bytes do AES-256-GCM.' },
          authTag: { type: 'string', format: 'byte', description: 'Tag de autenticação de 16 bytes.' },
          ciphertext: {
            type: 'string',
            format: 'byte',
            description: 'JSON completo do diagnóstico criptografado, incluindo screenshotBase64 quando houver.'
          }
        }
      },
      ApplicationError: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          product_code: { type: 'string' },
          occurred_at: { type: 'string' },
          version: { type: 'string' },
          terminal_name: { type: 'string' },
          checkout_number: { type: 'string' },
          computer_name: { type: 'string' },
          user_name: { type: 'string' },
          exception_class: { type: 'string' },
          message: { type: 'string' },
          received_at: { type: 'string' },
          has_screenshot: { type: 'integer', enum: [0, 1] }
        }
      },
      Dashboard: {
        type: 'object',
        properties: {
          channels: { type: 'array', items: { type: 'string', enum: ['test', 'beta', 'production'] } },
          clients: { type: 'integer' },
          terminals: { type: 'integer' },
          releases: { type: 'integer' },
          errors: { type: 'integer' }
        }
      },
      Client: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          external_id: { type: 'string' },
          name: { type: 'string' },
          document: { type: 'string', nullable: true },
          first_seen_at: { type: 'string' },
          last_seen_at: { type: 'string' },
          terminal_count: { type: 'integer' },
          last_terminal_seen: { type: 'string', nullable: true }
        }
      },
      Terminal: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          external_id: { type: 'string' },
          client_id: { type: 'integer' },
          name: { type: 'string' },
          computer_name: { type: 'string', nullable: true },
          product_code: { type: 'string' },
          channel: { type: 'string' },
          current_version: { type: 'string' },
          os_version: { type: 'string', nullable: true },
          first_seen_at: { type: 'string' },
          last_seen_at: { type: 'string' }
        }
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          code: { type: 'string' },
          name: { type: 'string' },
          active: { type: 'integer', enum: [0, 1] },
          created_at: { type: 'string' }
        }
      },
      ProductCreate: {
        type: 'object',
        required: ['code', 'name'],
        properties: { code: { type: 'string', example: 'pdv' }, name: { type: 'string', example: 'PDV' } }
      },
      Release: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          product_id: { type: 'integer' },
          version: { type: 'string' },
          artifact_type: { type: 'string', enum: ['package', 'sql'] },
          original_name: { type: 'string' },
          channel: { type: 'string' },
          file_path: { type: 'string' },
          sha256: { type: 'string' },
          size_bytes: { type: 'integer' },
          mandatory: { type: 'integer', enum: [0, 1] },
          deadline_at: { type: 'string', format: 'date-time', nullable: true },
          minimum_version: { type: 'string', nullable: true },
          notes: { type: 'string', nullable: true, description: 'Nota interna do painel.' },
          technical_notes: { type: 'string', nullable: true },
          show_notes_pdv: { type: 'integer', enum: [0, 1] },
          published_by: { type: 'integer', nullable: true },
          published_by_name: { type: 'string', nullable: true },
          active: { type: 'integer', enum: [0, 1] },
          published_at: { type: 'string' },
          product_name: { type: 'string' },
          targets: { type: 'string' },
          terminal_count: { type: 'integer' }
        }
      },
      ReleaseCreate: {
        type: 'object',
        required: ['artifactType', 'productId', 'version', 'channel', 'targetType', 'deadlineAt'],
        properties: {
          artifact: { type: 'string', format: 'binary', description: 'Pacote ZIP quando não for usado artifactId.' },
          artifactId: { type: 'string', description: 'ID de um artefato enviado pelo usuário autenticado.' },
          sqlContent: { type: 'string', description: 'Comandos SQL obrigatórios quando artifactType for sql.' },
          artifactType: { type: 'string', enum: ['package', 'sql'] },
          productId: { type: 'integer' },
          version: { type: 'string', example: '1.2.0' },
          channel: { type: 'string', enum: ['test', 'beta', 'production'] },
          targetType: { type: 'string', enum: ['all', 'client'] },
          targetClientIds: {
            type: 'string',
            default: '[]',
            description: 'Array JSON de IDs quando targetType for client.'
          },
          mandatory: { type: 'boolean', default: false },
          deadlineAt: {
            type: 'string',
            format: 'date-time',
            description: 'Prazo após o qual uma atualização opcional passa a ser obrigatória.'
          },
          minimumVersion: { type: 'string', nullable: true },
          notes: { type: 'string', nullable: true, description: 'Nota interna exibida somente no painel.' },
          technicalNotes: { type: 'string', nullable: true, description: 'Nota técnica destinada ao PDV.' },
          showNotesPdv: { type: 'boolean', default: false }
        }
      },
      UpdateLog: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          status: { type: 'string' },
          message: { type: 'string', nullable: true },
          client_name: { type: 'string', nullable: true },
          terminal_name: { type: 'string', nullable: true },
          product_name: { type: 'string', nullable: true },
          previous_version: { type: 'string', nullable: true },
          target_version: { type: 'string', nullable: true },
          artifact_type: { type: 'string', nullable: true },
          ip: { type: 'string', nullable: true },
          created_at: { type: 'string' }
        }
      }
    }
  }
};
