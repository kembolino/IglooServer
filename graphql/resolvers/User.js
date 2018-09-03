import {
  authenticated,
  logErrorsPromise,
  findAllValues,
  getAll,
} from './utilities'
import { Op } from 'sequelize'

const QUERY_COST = 1

const retrieveUserScalarProp = (User, prop, acceptedTokens) => (
  root,
  args,
  context,
) =>
  logErrorsPromise(
    'retrieveScalarProp',
    106,
    authenticated(
      context,
      async (resolve, reject) => {
        if (context.auth.userId !== root.id) {
          reject('You are not allowed to access details about this user')
        } else {
          const userFound = await User.find({ where: { id: root.id } })
          if (!userFound) {
            reject("User doesn't exist. Use `SignupUser` to create one")
          } else {
            resolve(userFound[prop])
          }
        }
      },
      acceptedTokens,
    ),
  )

const scalarProps = (User, props) =>
  props.reduce((acc, prop) => {
    acc[prop] = retrieveUserScalarProp(User, prop)
    return acc
  }, {})

const retrievePublicUserScalarProp = (User, prop, acceptedTokens) => (
  root,
  args,
  context,
) =>
  logErrorsPromise(
    'retrieveScalarProp',
    106,
    authenticated(
      context,
      async (resolve, reject) => {
        const userFound = await User.find({ where: { id: root.id } })
        if (!userFound) {
          reject("User doesn't exist. Use `SignupUser` to create one")
        } else {
          resolve(userFound[prop])
        }
      },
      acceptedTokens,
    ),
  )

const UserResolver = ({
  User,
  PermanentToken,
  Device,
  Board,
  FloatValue,
  StringValue,
  BoolValue,
  ColourValue,
  PlotValue,
  StringPlotValue,
  MapValue,
  Notification,
}) => ({
  ...scalarProps(User, [
    'createdAt',
    'updatedAt',
    'quietMode',
    'language',
    'timezone',
    'devMode',
    'nightMode',
    'monthUsage',
    'emailIsVerified',
  ]),
  email: retrievePublicUserScalarProp(User, 'email', [
    'TEMPORARY',
    'PERMANENT',
    'PASSWORD_RECOVERY',
  ]),
  displayName: retrievePublicUserScalarProp(User, 'displayName', [
    'TEMPORARY',
    'PERMANENT',
    'PASSWORD_RECOVERY',
  ]),
  profileIcon: retrievePublicUserScalarProp(User, 'profileIcon', [
    'TEMPORARY',
    'PERMANENT',
    'PASSWORD_RECOVERY',
  ]),
  profileIconColor: retrievePublicUserScalarProp(User, 'profileIconColor', [
    'TEMPORARY',
    'PERMANENT',
    'PASSWORD_RECOVERY',
  ]),
  paymentPlan: retrieveUserScalarProp(User, 'paymentPlan', [
    'TEMPORARY',
    'PERMANENT',
    'SWITCH_TO_PAYING',
  ]),
  usageCap: retrieveUserScalarProp(User, 'usageCap', [
    'TEMPORARY',
    'PERMANENT',
    'CHANGE_USAGE_CAP',
  ]),
  devices(root, args, context) {
    return logErrorsPromise(
      'User devices resolver',
      107,
      authenticated(context, async (resolve, reject) => {
        /* istanbul ignore if - this should never be the case, so the error is not reproducible */
        if (context.auth.userId !== root.id) {
          reject('You are not allowed to access details about this user')
        } else {
          const devices = await getAll(Device, User, root.id)
          const devicesInheritedByBoards = await getAll(Board, User, root.id, [
            { model: Device },
          ])

          resolve([...devices, ...devicesInheritedByBoards])
          context.billingUpdater.update(QUERY_COST * devices.length)
        }
      }),
    )
  },
  boards(root, args, context) {
    return logErrorsPromise(
      'User boards resolver',
      904,
      authenticated(context, async (resolve, reject) => {
        /* istanbul ignore if - this should never be the case, so the error is not reproducible */
        if (context.auth.userId !== root.id) {
          reject('You are not allowed to access details about this user')
        } else {
          const boards = await getAll(Board, User, root.id)

          resolve(boards)
          context.billingUpdater.update(QUERY_COST * boards.length)
        }
      }),
    )
  },
  notifications(root, args, context) {
    return logErrorsPromise(
      'User devices resolver',
      119,
      authenticated(context, async (resolve, reject) => {
        /* istanbul ignore if - this should never be the case, so the error is not reproducible */
        if (context.auth.userId !== root.id) {
          reject('You are not allowed to access details about this user')
        } else {
          // TODO: fetch all devices and include the notifications then flatten
          const notifications = await Notification.findAll({
            where: { userId: root.id },
          })
          resolve(notifications)
          context.billingUpdater.update(QUERY_COST * notifications.length)
        }
      }),
    )
  },
  values(root, args, context) {
    return logErrorsPromise(
      'User values resolver',
      108,
      authenticated(context, async (resolve, reject) => {
        /* istanbul ignore if - this should never be the case, so the error is not reproducible */
        if (context.auth.userId !== root.id) {
          reject('You are not allowed to access details about this user')
        } else {
          // TODO: fetch all the values (also inherited ones) and tag them with the right __resolveType
          const valueModels = [
            FloatValue,
            StringValue,
            BoolValue,
            ColourValue,
            PlotValue,
            StringPlotValue,
            MapValue,
          ]
          const directlySharedValues = await Promise.all(valueModels.map(Model => getAll(Model, User, root.id)))
          const flattenedDirectlySharedValues = directlySharedValues.reduce(
            (acc, curr) => [...acc, ...curr],
            [],
          )
          const valuesInheritedFromDevices = await getAll(
            Device,
            User,
            root.id,
            valueModels.map(Model => ({ model: Model })),
          )
          const flattenedValuesInheritedFromDevices = valuesInheritedFromDevices.reduce(
            (acc, device) => [
              ...acc,
              ...device.floatValues,
              ...device.stringValues,
              ...device.boolValues,
              ...device.colourValues,
              ...device.plotValues,
              ...device.stringPlotValues,
              ...device.mapValues,
            ],
            [],
          )
          console.log(flattenedValuesInheritedFromDevices)

          const valuesInheritedFromBoards = await getAll(Board, User, root.id, [
            {
              model: Device,
              include: valueModels.map(Model => ({ model: Model })),
            },
          ])
          const flattenedValuesInheritedFromBoards = valuesInheritedFromBoards.reduce(
            (acc, curr) => [
              ...acc,
              ...curr.devices.reduce(
                (acc, device) => [
                  ...acc,
                  ...device.floatValues,
                  ...device.stringValues,
                  ...device.boolValues,
                  ...device.colourValues,
                  ...device.plotValues,
                  ...device.stringPlotValues,
                  ...device.mapValues,
                ],
                [],
              ),
            ],
            [],
          )

          // TODO: remove duplicates
          const flattenedAllValues = [
            ...flattenedDirectlySharedValues,
            ...flattenedValuesInheritedFromDevices,
            ...flattenedValuesInheritedFromBoards,
          ]
          resolve(flattenedAllValues)
          context.billingUpdater.update(QUERY_COST * flattenedAllValues.length)
        }
      }),
    )
  },
  permanentTokens(root, args, context) {
    return logErrorsPromise(
      'user permanentTokens',
      127,
      authenticated(context, async (resolve, reject) => {
        /* istanbul ignore if - this should never be the case, so the error is not reproducible */
        if (context.auth.userId !== root.id) {
          reject('You are not allowed to access details about this user')
        } else {
          const tokens = await PermanentToken.findAll({
            where: { userId: root.id },
          })

          resolve(tokens)
          context.billingUpdater.update(QUERY_COST * tokens.length)
        }
      }),
    )
  },
})

export default UserResolver
