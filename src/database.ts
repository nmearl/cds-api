import { Model, Op, Sequelize } from "sequelize";
import dotenv from "dotenv";

import { Class, initializeClassModel } from "./models/class";
import { Educator, initializeEducatorModel } from "./models/educator";
import { Student, initializeStudentModel } from "./models/student";
import { StudentsClasses, initializeStudentClassModel } from "./models/student_class";
import { HubbleMeasurement, initializeHubbleMeasurementModel } from "./models/hubble_measurement";
import {
  createClassCode,
  createVerificationCode,
  encryptPassword,
} from "./utils";


import {
  CreateClassResult,
  LoginResult,
  SignUpResult,
  VerificationResult,
  SubmitHubbleMeasurementResult
} from "./request_results";

import { User } from "./user";
import { Galaxy, initializeGalaxyModel } from "./models/galaxy";
import { initializeStoryStateModel, StoryState } from "./models/story_state";
import { ClassStories, initializeClassStoryModel } from "./models/story_class";
import { initializeStoryModel } from "./models/story";
import { setUpAssociations } from "./associations";

type SequelizeError = { parent: { code: string } };

export type LoginResponse = {
  result: LoginResult;
  id?: number;
  success: boolean;
};

export type CreateClassResponse = {
  result: CreateClassResult;
  class?: object;
}

// Grab any environment variables
// Currently, just the DB password
dotenv.config();

export const cosmicdsDB = new Sequelize("cosmicds_db", "cdsadmin", process.env.DB_PASSWORD, {
    host: "cosmicds-db.cupwuw3jvfpc.us-east-1.rds.amazonaws.com",
    dialect: "mysql",
    define: {
      timestamps: false
    }
});

// export const cosmicdsDB = new Sequelize('cosmicds_db', 'jon', 'Testp@ss123', {
//   host: 'localhost',
//   dialect: 'mysql',
//   define: {
//     timestamps: false
//   }
// });

console.log(cosmicdsDB);

// Initialize our models with our database connection
initializeEducatorModel(cosmicdsDB);
initializeStudentModel(cosmicdsDB);
initializeClassModel(cosmicdsDB);
initializeStoryModel(cosmicdsDB);
initializeStudentClassModel(cosmicdsDB);
initializeGalaxyModel(cosmicdsDB);
initializeHubbleMeasurementModel(cosmicdsDB);
initializeStoryStateModel(cosmicdsDB);
initializeClassStoryModel(cosmicdsDB);

// Create any associations that we need
setUpAssociations();
 
// // Synchronize models with the database
// (async () => {
//   const createIfExistsOptions = {};
//   //const alterOptions = { alter: true };
//   const syncOptions = createIfExistsOptions;
//   await Educator.sync(syncOptions).catch(console.log);
//   await Student.sync(syncOptions).catch(console.log);
//   await Class.sync(syncOptions).catch(console.log);
//   await StudentsClasses.sync(syncOptions).catch(console.log);
// })();


// For now, this just distinguishes between duplicate account creation and other errors
// We can flesh this out layer
function signupResultFromError(error: SequelizeError): SignUpResult {
  const code = error.parent.code;
  switch (code) {
    case "ER_DUP_ENTRY":
      return SignUpResult.EmailExists;
    default:
      return SignUpResult.Error;
  }
}

function createClassResultFromError(error: SequelizeError): CreateClassResult {
  const code = error.parent.code;
  switch (code) {
    case "ER_DUP_ENTRY":
      return CreateClassResult.AlreadyExists;
    default:
      return CreateClassResult.Error;
  }
}

async function findEducatorByEmail(email: string): Promise<Educator | null> {
  return Educator.findOne({
    where: { email: { [Op.like] : email } }
  });
}

async function findStudentByEmail(email: string): Promise<Student | null> {
  return Student.findOne({
    where: { email: { [Op.like] : email } }
  });
}

async function findStudentById(id: number): Promise<Student | null> {
  return Student.findOne({
    where: { id : id }
  });
}

async function findEducatorById(id: number): Promise<Educator | null> {
  return Educator.findOne({
    where: { id: id }
  });
}

export async function verifyStudent(verificationCode: string): Promise<VerificationResult> {
  const result = await Student.findAll({
    where: {
      verification_code: verificationCode
    }
  });
  if (result.length > 0) {
    const student = result[0];
    if (student.verified === 1) {
      return VerificationResult.AlreadyVerified;
    }
    student.update({ verified: 1 }, {
      where: { id: student.id }
    });
    return VerificationResult.Ok;
  }
  return VerificationResult.InvalidCode;
}

export async function verifyEducator(verificationCode: string): Promise<VerificationResult> {
  const result = await Educator.findAll({
    where: {
      verification_code: verificationCode
    }
  });
  if (result.length > 0) {
    const educator = result[0];
    if (educator.verified === 1) {
      return VerificationResult.AlreadyVerified;
    }
    educator.update({ verified: 1 }, {
      where: { id: educator.id }
    });
    return VerificationResult.Ok;
  }
  return VerificationResult.InvalidCode;
}

async function studentVerificationCodeExists(code: string): Promise<boolean> {
  const result = await Student.findAll({
    where: { verification_code: code }
  });
  return result.length > 0;
}

async function educatorVerificationCodeExists(code: string): Promise<boolean> {
  const result = await Educator.findAll({
    where: { verification_code: code }
  });
  return result.length > 0;
}

export async function signUpEducator(firstName: string, lastName: string,
                              password: string, institution: string | null,
                              email: string, age: number | null, gender: string): Promise<SignUpResult> {
                         
  const encryptedPassword = encryptPassword(password);

  let validCode;
  let verificationCode: string;
  do {
    verificationCode = createVerificationCode();
    validCode = !(await educatorVerificationCodeExists(verificationCode) || await studentVerificationCodeExists(verificationCode));
  } while (!validCode);

  let result = SignUpResult.Ok;
  await Educator.create({
      first_name: firstName,
      last_name: lastName,
      verified: 0,
      verification_code: verificationCode,
      password: encryptedPassword,
      institution: institution,
      email: email,
      age: age,
      gender: gender,
    })
    .catch(error => {
      result = signupResultFromError(error);
    });
    return result;
}

export async function signUpStudent(username: string,
                             password: string, institution: string | null,
                             email: string, age: number, gender: string,
                             classroomCode: string | null): Promise<SignUpResult> {
  
  const encryptedPassword = encryptPassword(password);

  let validCode;
  let verificationCode: string;
  do {
    verificationCode = createVerificationCode();
    validCode = !(await educatorVerificationCodeExists(verificationCode) || await studentVerificationCodeExists(verificationCode));
  } while (!validCode);
  
  let result = SignUpResult.Ok;
  const student = await Student.create({
    username: username,
    verified: 0,
    verification_code: verificationCode,
    password: encryptedPassword,
    institution: institution,
    email: email,
    age: age,
    gender: gender,
  })
  .catch(error => {
    result = signupResultFromError(error);
  });

  // If the student has a valid classroom code,
  // add them to the class
  if (student && classroomCode) {
    const cls = await findClassByCode(classroomCode);
    if (cls !== null) {
      StudentsClasses.create({
        student_id: student.id,
        class_id: cls.id
      });
    }
  }

  return result;
}

export async function createClass(educatorID: number, name: string): Promise<CreateClassResponse> {
  
  let result = CreateClassResult.Ok;
  const code = createClassCode(educatorID, name);
  const creationInfo = {
    educator_id: educatorID,
    name: name,
    code: code,
  };
  const cls = await Class.create(creationInfo)
  .catch(error => {
    result = createClassResultFromError(error);
  });

  const info = result === CreateClassResult.Ok ? creationInfo : undefined;

  // For the pilot, the Hubble Data Story will be the only option,
  // so we'll automatically associate that with the class
  if (cls) {
    ClassStories.create({
      story_name: "hubbles_law",
      class_id: cls.id
    });
  }

  return { result: result, class: info };
}

export async function addStudentToClass(studentID: number, classID: number): Promise<StudentsClasses> {
  return StudentsClasses.create({
    student_id: studentID,
    class_id: classID
  });
}

async function checkLogin<T extends Model & User>(email: string, password: string, emailFinder: (email: string)
  => Promise<T | null>): Promise<LoginResponse> {

  const encryptedPassword = encryptPassword(password);
  const user = await emailFinder(email);
  let result: LoginResult;
  if (user === null) {
    result = LoginResult.EmailNotExist;
  } else if (user.password !== encryptedPassword) {
    result = LoginResult.IncorrectPassword;
  } else if (user.verified !== 1) {
    result = LoginResult.NotVerified;
  } else {
    result = LoginResult.Ok;
    user.update({
      visits: user.visits + 1,
      last_visit: Date.now()
    }, {
      where: { id: user.id }
    });
  }
  return {
    result: result,
    id: user?.id,
    success: LoginResult.success(result)
  };
}

export async function checkStudentLogin(email: string, password: string): Promise<LoginResponse> {
  return checkLogin(email, password, findStudentByEmail);
}

export async function checkEducatorLogin(email: string, password: string): Promise<LoginResponse> {
  return checkLogin(email, password, findEducatorByEmail);
}

export async function submitHubbleMeasurement(data: {
  student_id: number,
  galaxy_id: number,
  rest_wave_value: number | null,
  rest_wave_unit: string | null,
  obs_wave_value: number | null,
  obs_wave_unit: string | null,
  velocity_value: number | null,
  velocity_unit: string | null,
  ang_size_value: number | null,
  ang_size_unit: string | null,
  est_dist_value: number | null,
  est_dist_init: string | null
}): Promise<SubmitHubbleMeasurementResult> {

  const student = await findStudentById(data.student_id);
  if (student === null) {
    return SubmitHubbleMeasurementResult.NoSuchStudent;
  }

  const measurement = await HubbleMeasurement.findOne({
    where: {
      [Op.and]: [
        { student_id: data.student_id },
        { galaxy_id: data.galaxy_id }
      ]
    }
  })
  .catch(console.log);

  if (measurement) {
    measurement.update(data, {
      where: {
        [Op.and]: [
          { student_id: measurement.student_id },
          { galaxy_id: measurement.galaxy_id }
        ]
      }
    })
    .catch(console.log);
    return SubmitHubbleMeasurementResult.MeasurementUpdated;
  } else {
    HubbleMeasurement.create(data).catch(console.log);
    return SubmitHubbleMeasurementResult.MeasurementCreated;
  }
}

export async function getHubbleMeasurement(studentID: number, galaxyID: number): Promise<HubbleMeasurement | null> {
  return HubbleMeasurement.findOne({
    where: {
      [Op.and]: [
        { student_id: studentID },
        { galaxy_id: galaxyID }
      ]
    }
  }).catch(error => {
    console.log(error);
    return null;
  });
}

export async function getStudentHubbleMeasurements(studentID: number): Promise<HubbleMeasurement[] | null> {
  const result = await HubbleMeasurement.findAll({
  where: {
      student_id: studentID
    }
  })
  .catch(error => {
    console.log(error);
    return null;
  });
  return result;
}

export async function getAllGalaxies(): Promise<Galaxy[]> {
  return Galaxy.findAll({
    where: { is_bad: 0 }
  });
}

export async function getAllStudents(): Promise<Student[]> {
  return Student.findAll();
}

export async function getAllEducators(): Promise<Educator[]> {
  return Educator.findAll();
}

export async function getStoryState(studentID: number, storyName: string): Promise<JSON | null> {
  const result = await StoryState.findOne({
    where: {
      student_id: studentID,
      story_name: storyName
    }
  })
  .catch(error => {
    console.log(error);
    return null;
  });
  return result?.story_state || null;
}

export async function updateStoryState(studentID: number, storyName: string, newState: JSON): Promise<JSON | null> {
  let result = await StoryState.findOne({
    where: {
      student_id: studentID,
      story_name: storyName
    }
  })
  .catch(error => {
    console.log(error);
    return null;
  });

  const storyData = {
    student_id: studentID,
    story_name: storyName,
    story_state: newState
  };
  if (result !== null) {
    result?.update(storyData);
  } else {
    result = await StoryState.create(storyData).catch(error => {
      console.log(error);
      return null;
    });
  }
  return result?.story_state || null;
}

export async function getClassesForEducator(educatorID: number): Promise<Class[]> {
  return Class.findAll({
    where: {
      educator_id: educatorID
    }
  });
}

export async function getClassesForStudent(studentID: number): Promise<Class[]> {
  const classes = await StudentsClasses.findAll({
    where: {
      student_id: studentID
    }
  });
  const classIDs = classes.map(cls => cls.class_id);
  return Class.findAll({
    where: {
      id: {
        [Op.in]: classIDs
      }
    }
  });
}

export async function getStudentsForClass(classID: number): Promise<Student[]> {
  const students = await StudentsClasses.findAll({
    where: {
      class_id: classID
    }
  });
  const studentIDs = students.map(student => student.student_id);
  return Student.findAll({
    where: {
      id: {
        [Op.in]: studentIDs
      }
    }
  });
}

export async function deleteClass(id: number): Promise<number> {
  return Class.destroy({
    where: { id: id }
  });
}

export async function findClassByCode(code: string): Promise<Class | null> {
  return Class.findOne({
    where: { code: code }
  });
}

export async function getGalaxyByName(name: string): Promise<Galaxy | null> {
  return Galaxy.findOne({
    where: { name: name }
  });
}

export async function markGalaxyBad(galaxy: Galaxy): Promise<void> {
  galaxy.update({ marked_bad: galaxy.marked_bad + 1 });
}

export async function markGalaxySpectrumBad(galaxy: Galaxy): Promise<void> {
  galaxy.update({ spec_marked_bad: galaxy.spec_marked_bad + 1 });
}

export async function getRosterInfoForStory(classID: number, storyName: string): Promise<StoryState[]> {
  return StudentsClasses.findAll({
    where: { class_id: classID }
  }).then(entries => {
    const studentIDs = entries.map(entry => entry.student_id);
    return StoryState.findAll({
      include: [{
        model: Student,
        required: false, // We also want access to the student data
        attributes: ["username", "email"],
        as: "student"
      }],
      where: {
        student_id: {
          [Op.in]: studentIDs
        },
        story_name: storyName
      }
    });
  });
}

export async function getRosterInfo(classID: number): Promise<Record<string,StoryState[]|undefined>> {
  const activeStoryNames = await ClassStories.findAll({
    where: { class_id: classID}
  }).then(entries => entries.map(entry => entry.story_name));
  return activeStoryNames.reduce(async (obj, name) => {
    Object.assign(obj, { [name]: await getRosterInfoForStory(classID, name) });
    return obj;
  }, {});
}

/** For testing purposes */
export async function newDummyStudent(seed = false, teamMember: string | null = null): Promise<Student> {
  const students = await Student.findAll();
  const ids: number[] = students.map(student => {
    if (!student) { return 0; }
    return typeof student.id === "number" ? student.id : 0;
  });
  const newID = Math.max(...ids) + 1;
  return Student.create({
    username: `dummy_student_${newID}`,
    verified: 1,
    verification_code: `verification_${newID}`,
    password: "dummypass",
    institution: "Dummy",
    email: `dummy_student_${newID}@dummy.school`,
    age: null,
    gender: null,
    seed: seed ? 1 : 0,
    team_member: teamMember
  });
}
